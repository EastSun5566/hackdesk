import {
  ensureSyntaxTree,
  syntaxTree,
} from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

import { parseMarkdownImage } from './hfm-recognizers';
import { fenceOpenPattern } from './hfm-patterns';

export type RichPreviewRangeKind = 'fence' | 'image' | 'math-block' | 'table';

export type RichPreviewSourceRange = {
  from: number;
  kind: RichPreviewRangeKind;
  to: number;
};

const richFenceLanguages = new Set(['csvpreview', 'math', 'tex', 'latex', 'mermaid']);

export function getRichPreviewSourceRanges(state: EditorState): RichPreviewSourceRange[] {
  const ranges: RichPreviewSourceRange[] = [];
  const fencedLineNumbers = new Set<number>();
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);

  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') {
        return;
      }

      const startLine = state.doc.lineAt(node.from);
      const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
      for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
        fencedLineNumbers.add(lineNumber);
      }

      const language = startLine.text.match(fenceOpenPattern)?.[2]?.toLowerCase();
      if (language && richFenceLanguages.has(language)) {
        ranges.push({
          from: startLine.from,
          kind: 'fence',
          to: endLine.to,
        });
        return false;
      }
    },
  });

  addDollarMathBlockRanges(state, fencedLineNumbers, ranges);
  addTableRanges(state, ranges);
  addImageRanges(state, ranges);

  return ranges.sort((left, right) => left.from - right.from || left.to - right.to);
}

function addDollarMathBlockRanges(
  state: EditorState,
  fencedLineNumbers: ReadonlySet<number>,
  ranges: RichPreviewSourceRange[],
) {
  let openerLine: number | null = null;
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (fencedLineNumbers.has(lineNumber)) {
      openerLine = null;
      continue;
    }

    const line = state.doc.line(lineNumber);
    if (line.text.trim() !== '$$') {
      continue;
    }

    if (openerLine === null) {
      openerLine = lineNumber;
      continue;
    }

    const startLine = state.doc.line(openerLine);
    const endLine = line;
    const source = state.sliceDoc(startLine.to + 1, endLine.from - 1);
    if (source.trim().length > 0) {
      ranges.push({
        from: startLine.from,
        kind: 'math-block',
        to: endLine.to,
      });
    }

    openerLine = null;
  }
}

function addTableRanges(state: EditorState, ranges: RichPreviewSourceRange[]) {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);

  tree.iterate({
    enter(node) {
      if (node.name !== 'Table') {
        return;
      }

      const startLine = state.doc.lineAt(node.from);
      const endLine = getMarkdownTableEndLine(state, startLine.number);
      ranges.push({
        from: startLine.from,
        kind: 'table',
        to: endLine.to,
      });
      return false;
    },
  });
}

function getMarkdownTableEndLine(state: EditorState, parserEndLineNumber: number) {
  let endLine = state.doc.line(parserEndLineNumber);
  for (let lineNumber = parserEndLineNumber + 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (!isMarkdownTableRow(line.text)) {
      break;
    }
    endLine = line;
  }
  return endLine;
}

function isMarkdownTableRow(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.includes('|') && trimmed.length > 0;
}

function addImageRanges(state: EditorState, ranges: RichPreviewSourceRange[]) {
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const image = parseMarkdownImage(line.text, line.to);
    if (!image) {
      continue;
    }

    ranges.push({
      from: line.from,
      kind: 'image',
      to: line.to,
    });
  }
}
