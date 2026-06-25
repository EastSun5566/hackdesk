import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { hackmdCodeLanguages } from './hackmd-code-languages';
import { getRichPreviewBoundaryTarget } from './rich-preview-navigation';
import { getRichPreviewSourceRanges } from './rich-preview-ranges';

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

  it('moves through block MathJax source ranges', () => {
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
