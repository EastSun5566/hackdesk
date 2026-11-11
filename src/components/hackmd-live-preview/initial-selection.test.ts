import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { getActiveLines, getInitialCursor, hideInitialSelection, revealInitialSelection } from './hfm-decoration-ranges';

describe('initial selection without focus', () => {
  it('keeps even a single heading inactive until the editor is focused', () => {
    const state = EditorState.create({ doc: '# Heading', extensions: hideInitialSelection });
    expect([...getActiveLines(state)]).toEqual([]);
    const focused = state.update({ effects: revealInitialSelection.of() }).state;
    expect([...getActiveLines(focused)]).toEqual([1]);
  });
});

describe('initial cursor', () => {
  it('starts after front matter so the metadata panel stays collapsed', () => {
    const doc = (text: string) => EditorState.create({ doc: text }).doc;
    expect(getInitialCursor(doc('---\ntitle: A\n---\nBody'))).toBe('---\ntitle: A\n---\n'.length);
    expect(getInitialCursor(doc('---\ntitle: A\n---'))).toBe('---\ntitle: A\n---'.length);
    expect(getInitialCursor(doc('# No front matter\n---'))).toBe(0);
    expect(getInitialCursor(doc('---\nunclosed'))).toBe(0);
  });
});
