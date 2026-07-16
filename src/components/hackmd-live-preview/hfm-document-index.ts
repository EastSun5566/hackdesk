import { StateField, type EditorState, type Extension } from '@codemirror/state';

import { getHfmBlockRanges, parseMarkdownImage } from './hfm-recognizers';

export type HfmDocumentIndex = {
  blockRanges: ReturnType<typeof getHfmBlockRanges>;
  images: Array<NonNullable<ReturnType<typeof parseMarkdownImage>>>;
};

export function createHfmDocumentIndex(state: EditorState): HfmDocumentIndex {
  const lines: string[] = [];
  const images: HfmDocumentIndex['images'] = [];
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    lines.push(line.text);
    const image = parseMarkdownImage(line.text, line.to);
    if (image) images.push(image);
  }
  return { blockRanges: getHfmBlockRanges(lines), images };
}

const hfmDocumentIndexField = StateField.define<HfmDocumentIndex>({
  create: createHfmDocumentIndex,
  update(previous, transaction) {
    return transaction.docChanged ? createHfmDocumentIndex(transaction.state) : previous;
  },
});

export const hfmDocumentIndexExtension: Extension = hfmDocumentIndexField;

export function getHfmDocumentIndex(state: EditorState) {
  return state.field(hfmDocumentIndexField, false) ?? createHfmDocumentIndex(state);
}
