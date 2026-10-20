import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undo, history } from '@codemirror/commands';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DictationEvent } from '@/lib/dictation';

import { dictation, getDictationState, joinDictation, toggleDictation, type DictationHost } from './extension';

type Callbacks = Parameters<DictationHost['start']>[0];

function setup(doc: string, cursor = doc.length) {
  let callbacks: Callbacks | null = null;
  const recording = { stop: vi.fn(), cancel: vi.fn() };
  const host: DictationHost = {
    start: (next) => {
      callbacks = next;
      return recording;
    },
    shortcutLabel: () => '⇧⌘D',
  };
  const view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({ doc, selection: { anchor: cursor }, extensions: [history(), dictation(host)] }),
  });
  const send = (event: DictationEvent) => callbacks!.onEvent(event);
  return { view, host, recording, send, callbacks: () => callbacks! };
}

function press(view: EditorView, key: string) {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('dictation', () => {
  it('shows what it hears without changing the note, then inserts it as one undo step', () => {
    const { view, host, recording, send, callbacks } = setup('Notes:');
    expect(toggleDictation(view, host)).toBe(true);
    send({ type: 'ready' });
    send({ type: 'final', text: 'Hello world.' });
    send({ type: 'volatile', text: ' Second' });
    expect(view.state.doc.toString()).toBe('Notes:');
    expect(view.dom.querySelector('.cm-dictation-text')?.textContent).toBe(' Hello world. Second');
    expect(view.dom.querySelector('.cm-dictation-pill')?.textContent).toContain('Esc to cancel');

    toggleDictation(view, host);
    expect(recording.stop).toHaveBeenCalledOnce();
    expect(getDictationState(view.state).phase).toBe('finishing');
    callbacks().onDone('Hello world. Second line.');
    expect(view.state.doc.toString()).toBe('Notes: Hello world. Second line.');
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('Hello world. Second line.');
    expect(view.dom.querySelector('.cm-dictation-pill')).toBeNull();

    undo(view);
    expect(view.state.doc.toString()).toBe('Notes:');
    view.destroy();
  });

  it('Enter finishes, Escape cancels and leaves nothing behind', () => {
    const first = setup('A');
    toggleDictation(first.view, first.host);
    first.send({ type: 'ready' });
    press(first.view, 'Enter');
    expect(first.recording.stop).toHaveBeenCalledOnce();
    expect(first.view.state.doc.toString()).toBe('A');

    const second = setup('B');
    toggleDictation(second.view, second.host);
    second.send({ type: 'final', text: 'words' });
    press(second.view, 'Escape');
    expect(second.recording.cancel).toHaveBeenCalledOnce();
    expect(getDictationState(second.view.state).phase).toBe('idle');
    // A transcript arriving after the cancel is ignored.
    second.callbacks().onDone('words');
    expect(second.view.state.doc.toString()).toBe('B');
    first.view.destroy();
    second.view.destroy();
  });

  it('keeps text typed while recording and replaces only the original selection', () => {
    const { view, host, callbacks } = setup('Hi there', 8);
    view.dispatch({ selection: { anchor: 3, head: 8 } });
    toggleDictation(view, host);
    // Typed at both edges of the selected "there" while the recording runs.
    view.dispatch({ changes: [{ from: 3, insert: 'big ' }, { from: 8, insert: '!' }] });
    toggleDictation(view, host);
    callbacks().onDone('world');
    expect(view.state.doc.toString()).toBe('Hi big world!');
    view.destroy();
  });

  it('cancels the recording when the editor closes', () => {
    const { view, host, recording } = setup('');
    toggleDictation(view, host);
    view.destroy();
    expect(recording.cancel).toHaveBeenCalledOnce();
  });

  it('ends quietly when the host cannot record', () => {
    const { view } = setup('x');
    const host: DictationHost = { start: () => null, shortcutLabel: () => '' };
    expect(toggleDictation(view, host)).toBe(false);
    expect(getDictationState(view.state).phase).toBe('idle');
    view.destroy();
  });
});

describe('joinDictation', () => {
  it('spaces words of spaced languages, but not Chinese or punctuation', () => {
    expect(joinDictation('d', ' Hello ', '')).toEqual({ insert: ' Hello', start: 1, length: 5 });
    expect(joinDictation(' ', 'Hello', 'x')).toEqual({ insert: 'Hello ', start: 0, length: 5 });
    expect(joinDictation('。', '你好', '')).toMatchObject({ insert: '你好' });
    expect(joinDictation('a', '你好', 'b')).toMatchObject({ insert: '你好' });
    expect(joinDictation('(', 'Hello', ')')).toMatchObject({ insert: 'Hello' });
    expect(joinDictation('word', '.', '')).toMatchObject({ insert: '.' });
    expect(joinDictation('', '   ', '')).toMatchObject({ insert: '' });
  });
});
