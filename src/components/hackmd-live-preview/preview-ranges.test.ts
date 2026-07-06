import { EditorState } from '@codemirror/state';
import { WidgetType } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { pushReplace, type PreviewRange } from './preview-ranges';

describe('live-preview range helpers', () => {
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
