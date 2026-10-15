export type DiffLineKind = 'hunk' | 'add' | 'remove' | 'context';

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  /** Line number in the old text, for removed and context lines. */
  oldLine?: number;
  /** Line number in the new text, for added and context lines. */
  newLine?: number;
};

export type ParsedUnifiedDiff = {
  lines: DiffLine[];
  /** True when the diff had more lines than `maxLines` and the rest was dropped. */
  truncated: boolean;
};

export const MAX_RENDERED_DIFF_LINES = 5_000;

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parses a unified diff into display lines. File headers (`---`/`+++`), `diff`
 * and `index` lines and `\ No newline at end of file` markers are dropped.
 */
export function parseUnifiedDiff(text: string, maxLines = MAX_RENDERED_DIFF_LINES): ParsedUnifiedDiff {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  const rawLines = text.split('\n');
  if (rawLines.at(-1) === '') rawLines.pop();

  for (const raw of rawLines) {
    if (lines.length >= maxLines) {
      return { lines, truncated: true };
    }

    const hunk = HUNK_HEADER.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      lines.push({ kind: 'hunk', text: raw });
      continue;
    }

    if (!inHunk || raw.startsWith('\\')) {
      // Headers before the first hunk, and "\ No newline at end of file".
      continue;
    }

    const marker = raw[0];
    const content = raw.slice(1);
    if (marker === '+') {
      lines.push({ kind: 'add', text: content, newLine: newLine++ });
    } else if (marker === '-') {
      lines.push({ kind: 'remove', text: content, oldLine: oldLine++ });
    } else {
      lines.push({ kind: 'context', text: marker === ' ' ? content : raw, oldLine: oldLine++, newLine: newLine++ });
    }
  }

  return { lines, truncated: false };
}
