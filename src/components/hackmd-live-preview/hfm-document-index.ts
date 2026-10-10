import { StateField, type EditorState, type Extension } from '@codemirror/state';

import { getHfmBlockRanges, parseMarkdownImage } from './hfm-recognizers';

export type HfmDocumentIndex = {
  blockRanges: ReturnType<typeof getHfmBlockRanges>;
  images: Array<NonNullable<ReturnType<typeof parseMarkdownImage>>>;
};

export function createHfmDocumentIndex(state: EditorState): HfmDocumentIndex {
  const lines: string[] = [];
  const images: HfmDocumentIndex['images'] = [];
  let from = 0;
  for (const text of state.doc.iterLines()) {
    lines.push(text);
    const to = from + text.length;
    const image = parseMarkdownImage(text, to);
    if (image) images.push(image);
    from = to + 1;
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
