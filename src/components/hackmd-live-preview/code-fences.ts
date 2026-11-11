import type { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

import { getCodeLanguageLabel, parseCodeFenceInfo } from './hackmd-code-languages';
import { fenceOpenPattern } from './hfm-patterns';

export type CodeFence = {
  /** The line after the last content line holds a closing fence. */
  closed: boolean;
  endLine: number;
  label: string;
  /** Display numbers for the content lines, when the fence asks for HackMD line numbers. */
  numbering: { first: number; width: number } | null;
  startLine: number;
};

/**
 * Every fenced code block in the document, keyed by its opening line. Numbering needs the whole
 * document: here `=+` continues from the previous numbered block anywhere above it, not only an
 * adjacent one.
 */
export function getCodeFences(state: EditorState, tree: ReturnType<typeof syntaxTree>): Map<number, CodeFence> {
  const fences = new Map<number, CodeFence>();
  let nextNumber = 1;

  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') {
        return;
      }

      const startLine = state.doc.lineAt(node.from);
      const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
      const openMatch = startLine.text.trimStart().match(fenceOpenPattern);
      const info = openMatch ? `${openMatch[2] ?? ''}${openMatch[3] ?? ''}` : '';
      const closed = endLine.number > startLine.number && /^\s*(?:`{3,}|~{3,})\s*$/.test(endLine.text);
      const contentLines = Math.max(0, endLine.number - startLine.number - (closed ? 1 : 0));

      const { numbering } = parseCodeFenceInfo(info);
      let first: number | null = null;
      if (numbering) {
        first = 'continue' in numbering ? nextNumber : numbering.start;
        nextNumber = first + contentLines;
      }

      fences.set(startLine.number, {
        closed,
        endLine: endLine.number,
        label: getCodeLanguageLabel(info),
        numbering: first === null ? null : { first, width: String(first + Math.max(0, contentLines - 1)).length },
        startLine: startLine.number,
      });
      return false;
    },
  });

  return fences;
}

export function getCodeFenceLines(fences: ReadonlyMap<number, CodeFence>): Set<number> {
  const lines = new Set<number>();
  for (const fence of fences.values()) {
    for (let lineNumber = fence.startLine; lineNumber <= fence.endLine; lineNumber += 1) {
      lines.add(lineNumber);
    }
  }
  return lines;
}

export type CodeFenceLineRole =
  | { kind: 'header' }
  | { kind: 'footer' }
  | { kind: 'content'; last: boolean; number: number | null };

/** What a line of a fence is: its opener, its closer, or a content line with its display number. */
export function getCodeFenceLineRole(fence: CodeFence, lineNumber: number): CodeFenceLineRole {
  if (lineNumber === fence.startLine) {
    return { kind: 'header' };
  }
  if (fence.closed && lineNumber === fence.endLine) {
    return { kind: 'footer' };
  }
  return {
    kind: 'content',
    last: lineNumber === fence.endLine,
    number: fence.numbering ? fence.numbering.first + lineNumber - fence.startLine - 1 : null,
  };
}
