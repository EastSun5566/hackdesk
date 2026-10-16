import { fireEvent, render, screen } from '@testing-library/react';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiInline, openAiInlineMenu, type AiInlineHost } from '@/components/hackmd-live-preview/ai-inline/extension';
import { finishAiInlineRun, getAiInlineState, startAiInlineRun } from '@/components/hackmd-live-preview/ai-inline/state';

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
  view?.dom.parentElement?.remove();
  view?.destroy();
  view = null;
});

describe('AiInlinePanel', () => {
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
