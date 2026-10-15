import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiProviderStatus, AiTurnInput } from '@/lib/ai';
import { defaultSettings } from '@/lib/settings';

import { AiAssistDialog, type AiAssistSource } from './AiAssistDialog';

const selection: AiAssistSource = { from: 4, to: 9, text: 'Hello', isSelection: true };

function status(id: AiProviderStatus['id'], enabled: boolean): AiProviderStatus {
  return { id, enabled, phase: 'ready', message: null, version: '1', command: `/bin/${id}`, plan: null, models: [], usage: null };
}

function installApi({
  enabled = ['claude'] as AiProviderStatus['id'][],
  runTurn = vi.fn(async (_input: AiTurnInput, onDelta: (text: string) => void) => {
    onDelta('Ho');
    onDelta('la');
    return 'Hola';
  }),
} = {}) {
  window.hackdeskAPI = {
    getRuntimeEnvironment: () => 'electron',
    settings: {
      get: vi.fn(async () => ({ ai: { ...defaultSettings.ai, defaultProvider: enabled[0] ?? null } })),
    },
    app: { confirm: vi.fn() },
    ai: {
      listProviders: vi.fn(async () => [status('codex', enabled.includes('codex')), status('claude', enabled.includes('claude'))]),
      refreshProvider: vi.fn(),
      runTurn,
      cancelTurn: vi.fn(async () => undefined),
    },
  } as unknown as typeof window.hackdeskAPI;
  return { runTurn };
}

describe('AiAssistDialog', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('streams a rewrite of the selection and replaces it on apply', async () => {
    const { runTurn } = installApi();
    const onApply = vi.fn(() => true);
    const onOpenChange = vi.fn();
    render(<AiAssistDialog open source={selection} noteTitle="Greeting" isTeamNote={false} onOpenChange={onOpenChange} onApply={onApply} />);

    expect(await screen.findByText(/Sends the selected text to Claude/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace Selection' })).toBeEnabled());
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'claude', action: 'rewrite', text: 'Hello', noteTitle: 'Greeting' }),
      expect.any(Function),
    );
    expect(screen.getByRole('region', { name: 'AI result' })).toHaveTextContent('Hola');

    fireEvent.click(screen.getByRole('button', { name: 'Replace Selection' }));
    expect(onApply).toHaveBeenCalledWith('replace', 'Hola');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open when the note changed before applying', async () => {
    installApi();
    render(<AiAssistDialog open source={selection} noteTitle="" isTeamNote={false} onOpenChange={vi.fn()} onApply={() => false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace Selection' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Replace Selection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The note changed while AI was working');
    // The result stays available to copy.
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });

  it('shows the CLI error and points to Settings when no provider is on', async () => {
    installApi({ runTurn: vi.fn(async () => { throw new Error("Error invoking remote method 'ai:run-turn': Error: Not logged in"); }) });
    const { unmount } = render(<AiAssistDialog open source={selection} noteTitle="" isTeamNote onOpenChange={vi.fn()} onApply={vi.fn()} />);
    expect(await screen.findByText(/This is a team note/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not logged in');
    unmount();

    installApi({ enabled: [] });
    render(<AiAssistDialog open source={selection} noteTitle="" isTeamNote={false} onOpenChange={vi.fn()} onApply={vi.fn()} />);
    expect(await screen.findByText(/No AI provider is turned on/)).toBeInTheDocument();
  });
});
