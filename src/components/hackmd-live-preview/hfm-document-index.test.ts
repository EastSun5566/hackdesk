import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { createHfmDocumentIndex, getHfmDocumentIndex, hfmDocumentIndexExtension } from './hfm-document-index';

function largeMarkdown(lineCount: number) {
  return Array.from({ length: lineCount }, (_, index) => (
    index % 500 === 0 ? `![image ${index}](https://example.com/${index}.png)` : `line ${index}`
  )).join('\n');
}

describe('HFM document index', () => {
  it.each([5_000, 20_000])('indexes %i lines in one shared pass', (lineCount) => {
    const state = EditorState.create({ doc: largeMarkdown(lineCount) });
    const index = createHfmDocumentIndex(state);

    expect(index.images).toHaveLength(lineCount / 500);
  });

  it('reuses the index for selection-only transactions', () => {
    const state = EditorState.create({ doc: largeMarkdown(5_000), extensions: [hfmDocumentIndexExtension] });
    const initial = getHfmDocumentIndex(state);
    const next = state.update({ selection: { anchor: 10 } }).state;

    expect(getHfmDocumentIndex(next)).toBe(initial);
  });

  it('keeps image offsets across blank lines, Unicode and a trailing newline', () => {
    const source = '中文🙂\n\n![first](https://example.com/1.png)\n\n![last](https://example.com/2.png)\n';
    const state = EditorState.create({ doc: source });
    expect(createHfmDocumentIndex(state).images.map((image) => image.lineTo)).toEqual([
      state.doc.line(3).to,
      state.doc.line(5).to,
    ]);
  });
});
