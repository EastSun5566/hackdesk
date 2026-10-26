import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiInline, openAiInlineMenu, type AiInlineHost } from './extension';
import {
  acceptAiInline,
  appendAiInlineOutput,
  closeAiComparison,
  closeAiInline,
  finishAiInlineRun,
  getAiInlineState,
  getAiInlineEdit,
  getAiInlineTarget,
  openAiComparison,
  startAiInlineRun,
} from './state';

const views: EditorView[] = [];

function createHost(overrides: Partial<AiInlineHost> = {}): AiInlineHost {
  return {
    isAvailable: () => true,
    showSelectionChip: () => true,
    shortcutLabel: () => '⌘K',
    mountPanel: vi.fn(),
    releasePanel: vi.fn(),
    onStateChange: vi.fn(),
    ...overrides,
  };
}

function createView(doc: string, selection: { anchor: number; head?: number }, host = createHost()) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, selection: EditorSelection.single(selection.anchor, selection.head), extensions: [history(), aiInline(host)] }),
  });
  views.push(view);
  return { view, host };
}

function press(view: EditorView, key: string, modifiers: KeyboardEventInit = {}) {
  return runScopeHandlers(view, new KeyboardEvent('keydown', { key, ...modifiers }), 'editor');
}

const mod = /Mac/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };

function preview(view: EditorView, output: string, delivery: 'replace' | 'insert-below' = 'replace') {
  const { session } = getAiInlineState(view.state);
  view.dispatch({ effects: startAiInlineRun.of({ delivery }) });
  view.dispatch({ effects: appendAiInlineOutput.of({ session, text: output.slice(0, 3) }) });
  view.dispatch({ effects: finishAiInlineRun.of({ session, output }) });
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

describe('inline AI editor extension', () => {
  it('keeps editor keys from accepting or discarding while comparison takes focus', () => {
    const { view, host } = createView('Helo', { anchor: 0, head: 4 });
    openAiInlineMenu(view, host);
    preview(view, 'Hello');
    view.dispatch({ effects: openAiComparison.of(null) });
    const selection = view.state.selection;
    view.dispatch({ selection: { anchor: 0 } });
    expect(press(view, 'Escape')).toBe(true);
    expect(getAiInlineState(view.state)).toMatchObject({ phase: 'preview', comparison: null });
    expect(view.state.selection.eq(selection)).toBe(true);
    view.dispatch({ effects: openAiComparison.of(null) });
    const snapshot = getAiInlineState(view.state).comparison;
    for (const [key, modifiers] of [['Enter', {}], ['Enter', mod], ['k', mod]] as const) {
      expect(press(view, key, modifiers)).toBe(true);
      expect(getAiInlineState(view.state)).toMatchObject({ phase: 'preview', comparison: snapshot });
      expect(view.state.sliceDoc()).toBe('Helo');
    }
  });

  it.each([
    { doc: '# Note\n\nHelo wrold\n\nKeep this.', from: 8, to: 18, output: '  Hello world\n ', delivery: 'replace' as const, expected: '# Note\n\nHello world\n\nKeep this.' },
    { doc: 'First para\nSecond para', from: 0, to: 11, output: ' \n摘要\n ', delivery: 'insert-below' as const, expected: 'First para\n\n摘要\nSecond para' },
    { doc: 'First line\nSecond line', from: 0, to: 5, output: '- Summary', delivery: 'insert-below' as const, expected: 'First line\n\n- Summary\nSecond line' },
    { doc: '舊內容', from: 0, to: 3, output: ' 新\r\n內容 ', delivery: 'replace' as const, expected: '新\n內容' },
  ])('compares and accepts the same $delivery edit, with one undo', ({ doc, from, to, output, delivery, expected }) => {
    const { view, host } = createView(doc, { anchor: to, head: from });
    openAiInlineMenu(view, host);
    preview(view, output, delivery);
    const edit = getAiInlineEdit(view.state)!;
    expect(view.state.changes(edit.changes).apply(view.state.doc).toString()).toBe(expected);
    view.dispatch({ effects: openAiComparison.of(null) });
    expect(getAiInlineState(view.state).comparison?.doc).toBe(view.state.doc);
    expect(view.state.doc.toString()).toBe(doc);
    expect(acceptAiInline(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(expected);
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(output.trim().replace(/\r\n/g, '\n'));
    undo(view);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('invalidates the detailed snapshot on edits anywhere, retry, new session or discard', () => {
    const { view, host } = createView('one two three', { anchor: 4, head: 7 });
    openAiInlineMenu(view, host);
    preview(view, 'TWO');
    const open = () => view.dispatch({ effects: openAiComparison.of(null) });
    open();
    view.dispatch({ effects: closeAiComparison.of(null) });
    expect(getAiInlineState(view.state)).toMatchObject({ phase: 'preview', comparison: null });
    open();
    view.dispatch({ changes: { from: 0, insert: 'zero ' } });
    expect(getAiInlineState(view.state)).toMatchObject({ phase: 'preview', comparison: null });
    expect(host.onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ comparison: null }), view);
    open();
    view.dispatch({ effects: startAiInlineRun.of({ delivery: 'replace' }) });
    expect(getAiInlineState(view.state).comparison).toBeNull();
    expect(getAiInlineEdit(view.state)).toBeNull();
    preview(view, 'two');
    open();
    openAiInlineMenu(view, host);
    expect(getAiInlineState(view.state).comparison).toBeNull();
    preview(view, 'two');
    open();
    view.dispatch({ effects: closeAiInline.of(null) });
    expect(getAiInlineState(view.state)).toMatchObject({ phase: 'idle', comparison: null });
  });

  it('leaves ⌘K to the command palette without a selection or without a provider', () => {
    expect(press(createView('Hello world', { anchor: 3 }).view, 'k', mod)).toBe(false);
    expect(press(createView('Hello world', { anchor: 0, head: 5 }, createHost({ isAvailable: () => false })).view, 'k', mod)).toBe(false);
  });

  it('opens the menu on the selection with ⌘K and reports the session to the host', () => {
    const { view, host } = createView('Hello world', { anchor: 6, head: 11 });
    expect(press(view, 'k', mod)).toBe(true);
    expect(getAiInlineState(view.state)).toMatchObject({ phase: 'menu', from: 6, to: 11, original: 'world' });
    expect(host.onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'menu' }), view);
  });

  it('previews a rewrite as decorations without changing the note, then applies it as one undo step', () => {
    const { view, host } = createView('This are fine.', { anchor: 0, head: 14 });
    openAiInlineMenu(view, host);
    preview(view, 'This is fine.');
    expect(view.state.doc.toString()).toBe('This are fine.');
    expect(view.dom.querySelector('.cm-ai-deleted')?.textContent).toBe('are');
    expect(view.dom.querySelector('.cm-ai-inserted')?.textContent).toBe('is');

    expect(press(view, 'Enter')).toBe(true);
    expect(view.state.doc.toString()).toBe('This is fine.');
    expect(getAiInlineState(view.state).phase).toBe('idle');
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('This is fine.');

    undo(view);
    expect(view.state.doc.toString()).toBe('This are fine.');
  });

  it('adds a summary below the paragraph instead of replacing it', () => {
    const { view, host } = createView('First line\nSecond line', { anchor: 0, head: 5 });
    openAiInlineMenu(view, host);
    preview(view, '- Summary', 'insert-below');
    expect(view.dom.querySelector('.cm-ai-inserted-block')?.textContent).toBe('- Summary');
    expect(acceptAiInline(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('First line\n\n- Summary\nSecond line');
  });

  it('adds below the selected paragraph even when the selection ends at the next line start', () => {
    const { view, host } = createView('First para\nSecond para', { anchor: 0, head: 11 });
    openAiInlineMenu(view, host);
    preview(view, '- Summary', 'insert-below');
    expect(acceptAiInline(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('First para\n\n- Summary\nSecond para');
  });

  it('tells the host about session turns, not every streamed word', () => {
    const { view, host } = createView('alpha beta', { anchor: 0, head: 5 });
    openAiInlineMenu(view, host);
    const { session } = getAiInlineState(view.state);
    view.dispatch({ effects: startAiInlineRun.of({ delivery: 'replace' }) });
    const calls = vi.mocked(host.onStateChange).mock.calls.length;
    for (const text of ['a', 'b', 'c']) view.dispatch({ effects: appendAiInlineOutput.of({ session, text }) });
    expect(host.onStateChange).toHaveBeenCalledTimes(calls);
    view.dispatch({ effects: finishAiInlineRun.of({ session, output: 'abc' }) });
    expect(host.onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'preview' }), view);
  });

  it('keeps a preview when the note changes elsewhere and drops it when its text is edited', () => {
    const { view, host } = createView('one two three', { anchor: 4, head: 7 });
    openAiInlineMenu(view, host);
    preview(view, 'TWO');
    view.dispatch({ changes: { from: 0, insert: 'zero ' } });
    expect(getAiInlineState(view.state)).toMatchObject({ phase: 'preview', from: 9, to: 12 });

    view.dispatch({ changes: { from: 10, to: 11, insert: 'W' } });
    expect(getAiInlineState(view.state).phase).toBe('idle');
    expect(acceptAiInline(view)).toBe(false);
    expect(view.state.doc.toString()).toBe('zero one tWo three');
  });

  it('discards with Escape and ignores answers from an older session', () => {
    const { view, host } = createView('alpha beta', { anchor: 0, head: 5 });
    openAiInlineMenu(view, host);
    const { session } = getAiInlineState(view.state);
    view.dispatch({ effects: startAiInlineRun.of({ delivery: 'replace' }) });
    expect(press(view, 'Escape')).toBe(true);
    expect(getAiInlineState(view.state).phase).toBe('idle');

    openAiInlineMenu(view, host);
    view.dispatch({ effects: startAiInlineRun.of({ delivery: 'replace' }) });
    view.dispatch({ effects: appendAiInlineOutput.of({ session, text: 'stale' }) });
    expect(getAiInlineState(view.state).output).toBe('');
  });

  it('targets the whole note when nothing is selected', () => {
    const state = EditorState.create({ doc: 'whole note', selection: { anchor: 3 } });
    expect(getAiInlineTarget(state)).toEqual({ from: 0, to: 10 });
  });
});
