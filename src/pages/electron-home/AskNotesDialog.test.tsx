import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiProviderStatus, AskNotesInput } from '@/lib/ai';
import type { NotePassage, NotePassagesInput, NoteSearchScope } from '@/lib/note-index';
import { defaultSettings } from '@/lib/settings';

import { AskNotesDialog } from './AskNotesDialog';
import { useAskNotes } from './useAskNotes';

function status(id: AiProviderStatus['id'], enabled: boolean): AiProviderStatus {
  return { id, enabled, phase: 'ready', message: null, version: '1', command: null, plan: null, models: [], usage: null, apiKeyInEnvironment: false };
}

const passage = (noteId: string, title: string, text: string): NotePassage => ({
  note: { kind: 'local', vaultId: 'vault-1', noteId, title, snippet: null },
  text,
});

function installApi({ passages, askNotes }: {
  passages: NotePassage[];
  askNotes: (input: AskNotesInput, onDelta: (text: string) => void) => Promise<string>;
}) {
  const api = {
    getRuntimeEnvironment: () => 'electron',
    settings: { get: vi.fn(async () => ({ ai: defaultSettings.ai })) },
    ai: {
      listProviders: vi.fn(async () => [status('codex', false), status('claude', true)]),
      askNotes: vi.fn(askNotes),
      cancelTurn: vi.fn(async () => undefined),
    },
    noteIndex: { findPassages: vi.fn(async (_input: NotePassagesInput) => ({ passages, indexedCount: 3 })) },
  };
  window.hackdeskAPI = api as unknown as typeof window.hackdeskAPI;
  return api;
}

const SCOPE: NoteSearchScope = { type: 'local', vaultId: 'vault-1' };

function Harness({ onOpenNote }: { onOpenNote: (note: NotePassage['note']) => void }) {
  const askNotes = useAskNotes(SCOPE);
  return (
    <>
      <button type="button" onClick={() => askNotes.setOpen(true)}>Open</button>
      <AskNotesDialog askNotes={askNotes} onOpenNote={onOpenNote} />
    </>
  );
}

async function ask(question: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  const box = await screen.findByRole('textbox', { name: 'Question' });
  fireEvent.change(box, { target: { value: question } });
  fireEvent.keyDown(box, { key: 'Enter' });
}

afterEach(() => {
  delete window.hackdeskAPI;
});

describe('AskNotesDialog', () => {
  it('shows the sources, streams a cited answer, and opens a cited note', async () => {
    const api = installApi({
      passages: [passage('weekly', '產品週會', '結論：先做離線閱讀。'), passage('plan', 'Plan', 'Offline first.')],
      askNotes: async (_input, onDelta) => {
        onDelta('先做離線閱讀 [1]');
        onDelta('，計畫也這麼寫 [2]。[9]');
        return '先做離線閱讀 [1]，計畫也這麼寫 [2]。[9]';
      },
    });
    const onOpenNote = vi.fn();
    render(<Harness onOpenNote={onOpenNote} />);
    await waitFor(() => expect(api.ai.listProviders).toHaveBeenCalled());
    await ask('離線閱讀的結論？');

    await screen.findByText(/計畫也這麼寫/);
    expect(api.noteIndex.findPassages).toHaveBeenCalledWith({ question: '離線閱讀的結論？', scope: SCOPE });
    expect(api.ai.askNotes.mock.calls[0]![0]).toMatchObject({
      providerId: 'claude',
      question: '離線閱讀的結論？',
      sources: [{ title: '產品週會', text: '結論：先做離線閱讀。' }, { title: 'Plan', text: 'Offline first.' }],
      history: [],
    });
    expect(screen.getByRole('list', { name: 'Sources' }).textContent).toContain('產品週會');
    // A number that names no source stays text.
    expect(screen.queryByRole('button', { name: /^Source 9/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Source 2: Plan' }));
    expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ noteId: 'plan' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says when no notes match without asking AI, and sends earlier answers with a follow-up', async () => {
    let passages: NotePassage[] = [];
    const api = installApi({ passages, askNotes: async () => 'Offline reading ships first [1].' });
    api.noteIndex.findPassages.mockImplementation(async () => ({ passages, indexedCount: 3 }));
    render(<Harness onOpenNote={vi.fn()} />);
    await waitFor(() => expect(api.ai.listProviders).toHaveBeenCalled());

    await ask('Anything about llamas?');
    await screen.findByText('No notes match. HackDesk searched 3 notes in this workspace.');
    expect(api.ai.askNotes).not.toHaveBeenCalled();

    passages = [passage('plan', 'Plan', 'Offline first.')];
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), { target: { value: 'What ships first?' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Question' }), { key: 'Enter' });
    await screen.findByRole('button', { name: 'Source 1: Plan' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), { target: { value: 'And after that?' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Question' }), { key: 'Enter' });
    await waitFor(() => expect(api.ai.askNotes).toHaveBeenCalledTimes(2));
    expect(api.ai.askNotes.mock.calls[1]![0].history).toEqual([{ question: 'What ships first?', answer: 'Offline reading ships first [1].' }]);
  });

  it('stops a running answer', async () => {
    const api = installApi({ passages: [passage('plan', 'Plan', 'Offline first.')], askNotes: () => new Promise<string>(() => undefined) });
    render(<Harness onOpenNote={vi.fn()} />);
    await waitFor(() => expect(api.ai.listProviders).toHaveBeenCalled());
    await ask('What ships first?');
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    });
    const requestId = api.ai.askNotes.mock.calls[0]![0].requestId;
    expect(api.ai.cancelTurn).toHaveBeenCalledWith(requestId);
    expect(await screen.findByText('Stopped.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
