import type { Range, Text } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

export type PreviewRange = Range<Decoration>;

export function pushReplace(
  ranges: PreviewRange[],
  doc: Text,
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.replace>[0] = {},
) {
  if (from >= to) {
    return;
  }

  const startLine = doc.lineAt(from);
  if (to <= startLine.to) {
    ranges.push(Decoration.replace(spec).range(from, to));
    return;
  }

  let cursor = from;
  let firstSegment = true;
  while (cursor < to) {
    const line = doc.lineAt(cursor);
    const segmentTo = Math.min(to, line.to);
    if (segmentTo > cursor) {
      ranges.push(Decoration.replace(firstSegment ? spec : {}).range(cursor, segmentTo));
      firstSegment = false;
    }
    cursor = line.to + 1;
  }
}

