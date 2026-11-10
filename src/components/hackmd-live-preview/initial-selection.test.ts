import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { getActiveLines, hideInitialSelection, revealInitialSelection } from './hfm-decoration-ranges';

describe('initial selection without focus', () => {
  it('keeps even a single heading inactive until the editor is focused', () => {
    const state = EditorState.create({ doc: '# Heading', extensions: hideInitialSelection });
    expect([...getActiveLines(state)]).toEqual([]);
    const focused = state.update({ effects: revealInitialSelection.of() }).state;
    expect([...getActiveLines(focused)]).toEqual([1]);
  });
});
