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
});
