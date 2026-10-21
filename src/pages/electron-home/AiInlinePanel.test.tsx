import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiInline, openAiInlineMenu, type AiInlineHost } from '@/components/hackmd-live-preview/ai-inline/extension';
import { finishAiInlineRun, getAiInlineState, startAiInlineRun } from '@/components/hackmd-live-preview/ai-inline/state';
import { dictation, toggleDictation, type DictationHost } from '@/components/hackmd-live-preview/dictation/extension';

import { defaultSettings } from '@/lib/settings';

import { AiInlinePanel } from './AiInlinePanel';
import type { AiInlineController } from './useAiInline';

const host: AiInlineHost = {
  isAvailable: () => true,
  showSelectionChip: () => false,
  shortcutLabel: () => '⌘K',
  mountPanel: () => undefined,
  releasePanel: () => undefined,
  onStateChange: () => undefined,
};

let view: EditorView | null = null;

function setup(doc = 'Hello wrold', overrides: Partial<AiInlineController> = {}) {
  view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({ doc, selection: EditorSelection.single(0, doc.length), extensions: [aiInline(host)] }),
  });
  openAiInlineMenu(view, host);
  const controller: AiInlineController = {
    providers: ['claude', 'codex'],
    providerId: 'claude',
    setProviderId: vi.fn(),
    translateLanguage: 'Japanese',
    customCommands: [],
    isTeamNote: false,
    run: vi.fn(),
    retry: vi.fn(),
    lastRun: null,
    ...overrides,
  };
  const renderPanel = () => render(<AiInlinePanel view={view!} session={getAiInlineState(view!.state)} controller={controller} />);
  return { view, controller, renderPanel };
}

afterEach(() => {
  delete window.hackdeskAPI;
  view?.dom.parentElement?.remove();
  view?.destroy();
  view = null;
});

describe('AiInlinePanel', () => {
  it('offers to clean up text just dictated first, once', () => {
    let finish: ((text: string | null) => void) | undefined;
    const recorder: DictationHost = {
      start: ({ onDone }) => {
        finish = onDone;
        return { stop: () => undefined, cancel: () => undefined };
      },
      shortcutLabel: () => '',
      isShortcut: () => false,
    };
    view = new EditorView({
      parent: document.body.appendChild(document.createElement('div')),
      state: EditorState.create({ doc: 'Notes:', selection: { anchor: 6 }, extensions: [aiInline(host), dictation(recorder)] }),
    });
    toggleDictation(view, recorder);
    toggleDictation(view, recorder);
    finish!('um so the meeting is moved');
    openAiInlineMenu(view, host);
    const controller: AiInlineController = {
      providers: ['claude'], providerId: 'claude', setProviderId: vi.fn(), translateLanguage: 'English',
      customCommands: [], isTeamNote: false, run: vi.fn(), retry: vi.fn(), lastRun: null,
    };
    const { unmount } = render(<AiInlinePanel view={view} session={getAiInlineState(view.state)} controller={controller} />);
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Clean up dictation');
    expect(screen.getAllByText('Clean up dictation')).toHaveLength(1);
    fireEvent.click(options[0]!);
    expect(controller.run).toHaveBeenCalledWith(view, { action: 'cleanup' });
    unmount();
  });

  it('lists Clean up dictation last among the edits for other text', () => {
    const { renderPanel } = setup();
    renderPanel();
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Fix spelling & grammar');
    expect(options.at(-1)).toHaveTextContent('Clean up dictation');
  });

  it('runs a command from the menu and offers the typed text as a custom request', () => {
    const { view, controller, renderPanel } = setup();
    renderPanel();
    expect(screen.getByText('Translate to Japanese')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fix spelling & grammar'));
    expect(controller.run).toHaveBeenCalledWith(view, { action: 'fix' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Ask AI or pick a command' }), { target: { value: 'make it formal' } });
    fireEvent.click(screen.getByText(/Ask AI: make it formal/));
    expect(controller.run).toHaveBeenLastCalledWith(view, { action: 'custom', instruction: 'make it formal' });
  });

  it('switches provider from the footer and closes on Escape', () => {
    const { view, controller, renderPanel } = setup();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Switch provider/ }));
    expect(controller.setProviderId).toHaveBeenCalledWith('codex');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Ask AI or pick a command' }), { key: 'Escape' });
    expect(getAiInlineState(view.state).phase).toBe('idle');
  });

  it('closes the menu when focus moves outside it, but not when an item is pressed', () => {
    const { view, controller, renderPanel } = setup();
    renderPanel();
    const input = screen.getByRole('combobox', { name: 'Ask AI or pick a command' });
    expect(fireEvent.mouseDown(screen.getByText('Improve writing'))).toBe(false);
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button', { name: /Switch provider/ }) });
    expect(getAiInlineState(view.state).phase).toBe('menu');
    fireEvent.blur(input, { relatedTarget: view.contentDOM });
    expect(getAiInlineState(view.state).phase).toBe('idle');
    expect(controller.run).not.toHaveBeenCalled();
  });

  it('lists saved commands first and runs one with its prompt and placement', () => {
    const command = { id: 'c1', name: 'Meeting notes', prompt: 'Turn into meeting notes', delivery: 'insert-below' as const };
    const { view, controller, renderPanel } = setup('Hello wrold', { customCommands: [command] });
    renderPanel();
    expect(screen.getByText('Your commands')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Meeting notes'));
    expect(controller.run).toHaveBeenCalledWith(view, {
      action: 'custom',
      instruction: 'Turn into meeting notes',
      delivery: 'insert-below',
      label: 'Meeting notes',
      commandId: 'c1',
    });
  });

  it('offers to save a typed request as a command, but not a saved one', async () => {
    const update = vi.fn(async (input: { ai: typeof defaultSettings.ai }) => ({ ai: input.ai }));
    window.hackdeskAPI = {
      getRuntimeEnvironment: () => 'electron',
      settings: { get: vi.fn(async () => ({ ai: defaultSettings.ai })), update },
    } as unknown as typeof window.hackdeskAPI;
    const preview = (lastRun: AiInlineController['lastRun']) => {
      const context = setup('Hello wrold', { lastRun });
      const { session } = getAiInlineState(context.view.state);
      context.view.dispatch({ effects: startAiInlineRun.of({ delivery: 'replace' }) });
      context.view.dispatch({ effects: finishAiInlineRun.of({ session, output: 'Hello world' }) });
      return context;
    };

    const saved = preview({ action: 'custom', instruction: 'x', commandId: 'c1', label: 'X' });
    const { unmount } = saved.renderPanel();
    expect(screen.queryByRole('button', { name: /Save as command/ })).not.toBeInTheDocument();
    unmount();
    saved.view.destroy();

    preview({ action: 'custom', instruction: 'Make it formal' }).renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Save as command/ }));
    expect(screen.getByLabelText('Name')).toHaveValue('Make it formal');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0]![0].ai.customCommands).toEqual([
      expect.objectContaining({ name: 'Make it formal', prompt: 'Make it formal', delivery: 'replace' }),
    ]);
  });

  it('replaces the text when a previewed answer is accepted', () => {
    const { view, renderPanel } = setup('Hello wrold', { lastRun: { action: 'fix' } });
    const { session } = getAiInlineState(view.state);
    view.dispatch({ effects: startAiInlineRun.of({ delivery: 'replace' }) });
    view.dispatch({ effects: finishAiInlineRun.of({ session, output: 'Hello world' }) });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Replace/ }));
    expect(view.state.doc.toString()).toBe('Hello world');
  });
});
