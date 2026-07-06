import { history, undoDepth } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { createHackmdPreviewTheme } from './hackmd-preview-theme';

describe('HackMD preview theme', () => {
  it('reuses the generated extension for each resolved mode', () => {
    expect(createHackmdPreviewTheme('light')).toBe(createHackmdPreviewTheme('light'));
    expect(createHackmdPreviewTheme('dark')).toBe(createHackmdPreviewTheme('dark'));
  });

  it.each([
    ['light', false],
    ['dark', true],
  ] as const)('marks %s mode with the matching CodeMirror dark theme facet', (mode, expectedDarkTheme) => {
    const state = EditorState.create({
      extensions: createHackmdPreviewTheme(mode),
    });

    expect(state.facet(EditorView.darkTheme)).toBe(expectedDarkTheme);
  });

  it('reconfigures the theme without changing document, selection, or undo history', () => {
    const themeCompartment = new Compartment();
    let state = EditorState.create({
      doc: 'Hello',
      selection: { anchor: 2 },
      extensions: [history(), themeCompartment.of(createHackmdPreviewTheme('light'))],
    });
    state = state.update({
      changes: { from: 5, insert: ' world' },
      selection: { anchor: 3 },
    }).state;
    const documentBefore = state.doc.toString();
    const selectionBefore = state.selection;
    const undoDepthBefore = undoDepth(state);

    state = state.update({
      effects: themeCompartment.reconfigure(createHackmdPreviewTheme('dark')),
    }).state;

    expect(state.facet(EditorView.darkTheme)).toBe(true);
    expect(state.doc.toString()).toBe(documentBefore);
    expect(state.selection.eq(selectionBefore)).toBe(true);
    expect(undoDepth(state)).toBe(undoDepthBefore);
  });
});
