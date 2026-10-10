import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { hackmdCodeLanguages } from './hackmd-code-languages';
import { getRichPreviewBoundaryTarget } from './rich-preview-navigation';
import { getRichPreviewSourceRanges } from './rich-preview-ranges';
import { hackmdRichPreviewWidgets } from './rich-preview-widgets';

function createMarkdownState(markdownSource: string): EditorState {
  return EditorState.create({
    doc: markdownSource,
    extensions: [
      markdown({
        base: markdownLanguage,
        codeLanguages: hackmdCodeLanguages,
      }),
    ],
  });
}

describe('rich preview keyboard navigation', () => {
  it('reuses widgets within the same active lines but reveals source when a selection reaches another line', () => {
    let state = EditorState.create({
      doc: 'Before\n:smile:\nAfter',
      extensions: [hackmdRichPreviewWidgets(), EditorState.allowMultipleSelections.of(true)],
    });
    const initial = state.facet(EditorView.decorations)[0];
    state = state.update({ selection: { anchor: 2 } }).state;
    expect(state.facet(EditorView.decorations)[0]).toBe(initial);

    state = state.update({ selection: EditorSelection.create([
      EditorSelection.cursor(2), EditorSelection.cursor(state.doc.line(2).from),
    ]) }).state;
    const revealed = state.facet(EditorView.decorations)[0];
    expect(revealed).not.toBe(initial);
    expect(typeof revealed).not.toBe('function');
    if (typeof revealed !== 'function') expect(revealed.size).toBe(0);

    state = state.update({ selection: { anchor: state.doc.line(3).from } }).state;
    const restored = state.facet(EditorView.decorations)[0];
    if (typeof restored !== 'function') expect(restored.size).toBe(1);
  });

  it('rebuilds rich widgets for edits even when the cursor stays on the same line', () => {
    const state = EditorState.create({ doc: 'Before\n:smile:', extensions: [hackmdRichPreviewWidgets()] });
    const next = state.update({ changes: { from: state.doc.line(2).from, to: state.doc.length, insert: 'plain' } }).state;
    const decorations = next.facet(EditorView.decorations)[0];
    if (typeof decorations !== 'function') expect(decorations.size).toBe(0);
    expect(decorations).not.toBe(state.facet(EditorView.decorations)[0]);
  });

  it('moves down into a rich fence source range instead of skipping the widget', () => {
    const state = createMarkdownState([
      'Before',
      '```mermaid',
      'graph TD',
      'A-->B',
      '```',
      'After',
    ].join('\n'));

    const target = getRichPreviewBoundaryTarget(state, state.doc.line(1).from, 'down');

    expect(target).toBe(state.doc.line(2).from);
  });

  it('moves up into the last source line of a rich fence source range', () => {
    const state = createMarkdownState([
      'Before',
      '```csvpreview header="true"',
      'Name,Value',
      'a,b',
      '```',
      'After',
    ].join('\n'));

    const target = getRichPreviewBoundaryTarget(state, state.doc.line(6).from, 'up');

    expect(target).toBe(state.doc.line(5).from);
  });

  it('moves through block math source ranges', () => {
    const state = createMarkdownState([
      'Before',
      '$$',
      '\\frac{1}{x}',
      '$$',
      'After',
    ].join('\n'));

    expect(getRichPreviewBoundaryTarget(state, state.doc.line(1).from, 'down')).toBe(state.doc.line(2).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(5).from, 'up')).toBe(state.doc.line(4).from);
  });

  it('moves into the nearest rich block when multiple preview blocks are nearby', () => {
    const state = createMarkdownState([
      'Before',
      '$$',
      'x = 1',
      '$$',
      '',
      '$$',
      'y = 2',
      '$$',
      '',
      'After',
    ].join('\n'));

    expect(getRichPreviewBoundaryTarget(state, state.doc.line(10).from, 'up')).toBeNull();
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(9).from, 'up')).toBe(state.doc.line(8).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(5).from, 'up')).toBe(state.doc.line(4).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(5).from, 'down')).toBe(state.doc.line(6).from);
  });

  it('moves one logical line when the cursor is already inside a rich block source range', () => {
    const state = createMarkdownState([
      'Before',
      '```mermaid',
      'graph TD',
      'A-->B',
      '```',
      'After',
    ].join('\n'));

    expect(getRichPreviewBoundaryTarget(state, state.doc.line(3).from, 'up')).toBe(state.doc.line(2).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(3).from, 'down')).toBe(state.doc.line(4).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(5).from, 'down')).toBe(state.doc.line(6).from);
  });

  it('moves through markdown table source ranges', () => {
    const state = createMarkdownState([
      'Before',
      '| Name | Value |',
      '| --- | --- |',
      '| a | b |',
      'After',
    ].join('\n'));

    expect(getRichPreviewSourceRanges(state)).toContainEqual({
      from: state.doc.line(2).from,
      kind: 'table',
      to: state.doc.line(4).to,
    });
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(1).from, 'down')).toBe(state.doc.line(2).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(5).from, 'up')).toBe(state.doc.line(4).from);
  });

  it('moves through image preview source lines without jumping past the image', () => {
    const state = createMarkdownState([
      'Links',
      '',
      '![Minion](https://example.com/minion.png =320x180)',
      '',
      'Tables',
    ].join('\n'));

    expect(getRichPreviewSourceRanges(state)).toContainEqual({
      from: state.doc.line(3).from,
      kind: 'image',
      to: state.doc.line(3).to,
    });
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(2).from, 'down')).toBe(state.doc.line(3).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(4).from, 'up')).toBe(state.doc.line(3).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(3).from, 'up')).toBe(state.doc.line(2).from);
    expect(getRichPreviewBoundaryTarget(state, state.doc.line(3).from, 'down')).toBe(state.doc.line(4).from);
  });
});
