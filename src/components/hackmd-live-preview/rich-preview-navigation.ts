import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import {
  getRichPreviewSourceRanges,
} from './rich-preview-ranges';

type Direction = 'down' | 'up';

export function hackmdRichPreviewNavigation(): Extension {
  return Prec.highest(keymap.of([
    {
      key: 'ArrowDown',
      run: (view) => revealRichPreviewBlockAtBoundary(view, 'down'),
    },
    {
      key: 'ArrowUp',
      run: (view) => revealRichPreviewBlockAtBoundary(view, 'up'),
    },
  ]));
}

export function revealRichPreviewBlockAtBoundary(view: EditorView, direction: Direction): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const target = getRichPreviewBoundaryTarget(view.state, selection.head, direction);
  if (target === null) {
    return false;
  }

  view.dispatch({
    selection: { anchor: target },
    scrollIntoView: true,
  });
  return true;
}

export function getRichPreviewBoundaryTarget(state: EditorState, position: number, direction: Direction): number | null {
  const currentLine = state.doc.lineAt(position);
  const currentColumn = position - currentLine.from;
  const ranges = getRichPreviewSourceRanges(state);

  for (const range of ranges) {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(Math.max(range.from, range.to - 1));
    if (currentLine.number >= startLine.number && currentLine.number <= endLine.number) {
      const nextLineNumber = direction === 'down'
        ? currentLine.number + 1
        : currentLine.number - 1;
      if (nextLineNumber < 1 || nextLineNumber > state.doc.lines) {
        return null;
      }

      return clampLineColumn(state.doc.line(nextLineNumber), currentColumn);
    }
  }

  for (const range of ranges) {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(Math.max(range.from, range.to - 1));
    if (direction === 'down' && (currentLine.number + 1 === startLine.number || currentLine.to + 1 === startLine.from)) {
      return clampLineColumn(startLine, currentColumn);
    }

    if (direction === 'up' && (currentLine.number - 1 === endLine.number || position === endLine.to + 1)) {
      return clampLineColumn(endLine, currentColumn);
    }
  }

  return null;
}

function clampLineColumn(line: { from: number; to: number }, column: number): number {
  return Math.min(line.from + column, line.to);
}
