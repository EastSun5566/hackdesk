import type { EditorState } from '@codemirror/state';

export type ListMarkerPreview = {
  depth: number;
  display: string;
  from: number;
  indent: number;
  lineNumber: number;
  to: number;
};

type OrderedListLevel = {
  value: number;
};

const orderedListPattern = /^(\s*)(\d+)([.)])\s+/;

export function getOrderedListMarkerPreviews(state: EditorState): Map<string, ListMarkerPreview> {
  const previews = new Map<string, ListMarkerPreview>();
  const levels: OrderedListLevel[] = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const match = line.text.match(orderedListPattern);

    if (!match) {
      if (line.text.trim() === '') {
        levels.length = 0;
      }
      continue;
    }

    const indent = countIndentColumns(match[1]);
    const depth = Math.floor(indent / 2);
    levels.length = depth + 1;

    const rawValue = Number.parseInt(match[2], 10);
    const delimiter = match[3];
    const level = levels[depth];
    const value = level ? level.value + 1 : rawValue;
    levels[depth] = { value };

    const from = line.from + match[1].length;
    const to = from + match[2].length + delimiter.length;
    previews.set(getListMarkerPreviewKey(from, to), {
      depth,
      display: `${value}${delimiter}`,
      from,
      indent,
      lineNumber,
      to,
    });
  }

  return previews;
}

export function getListMarkerPreviewKey(from: number, to: number) {
  return `${from}:${to}`;
}

function countIndentColumns(indent: string) {
  let columns = 0;
  for (const char of indent) {
    columns += char === '\t' ? 4 : 1;
  }
  return columns;
}
