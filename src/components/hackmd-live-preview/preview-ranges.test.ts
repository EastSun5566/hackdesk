import { EditorState } from '@codemirror/state';
import { WidgetType } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { pushReplace, type PreviewRange } from './preview-ranges';
import { addHackmdLineSyntaxRanges } from './hfm-decoration-ranges';

describe('live-preview range helpers', () => {
  it('decorates only the requested lines while retaining document offsets', () => {
    const state = EditorState.create({ doc: 'Offscreen ==one==\n\nVisible ==two==\nOffscreen ==three==' });
    const ranges: PreviewRange[] = [];
    addHackmdLineSyntaxRanges(state, new Set(), ranges, new Set(), 3, 3);
    const line = state.doc.line(3);
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((range) => range.from >= line.from && range.to <= line.to)).toBe(true);
    expect(ranges.map((range) => state.sliceDoc(range.from, range.to))).toEqual(['==two==']);
  });

  it('keeps single-line replace decorations as a single range', () => {
    const state = EditorState.create({ doc: 'first\nsecond' });
    const ranges: PreviewRange[] = [];

    pushReplace(ranges, state.doc, 0, 5);

    expect(ranges.map((range) => [range.from, range.to])).toEqual([[0, 5]]);
  });

  it('splits multi-line replace decorations into single-line ranges', () => {
    const state = EditorState.create({ doc: 'first\nsecond\nthird' });
    const ranges: PreviewRange[] = [];

    pushReplace(ranges, state.doc, 2, 14, { widget: new EmptyWidget() });

    expect(ranges.map((range) => [range.from, range.to])).toEqual([
      [2, 5],
      [6, 12],
      [13, 14],
    ]);
  });
});

class EmptyWidget extends WidgetType {
  toDOM(): HTMLElement {
    return document.createElement('span');
  }
}
