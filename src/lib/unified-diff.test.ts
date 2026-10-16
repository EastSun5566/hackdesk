import { describe, expect, it } from 'vitest';

import { parseUnifiedDiff } from './unified-diff';

describe('parseUnifiedDiff', () => {
  it('numbers lines from the hunk header and drops file headers', () => {
    const diff = [
      '--- a/note.md',
      '+++ b/note.md',
      '@@ -3,3 +3,4 @@ ## Plan',
      ' keep',
      '-old',
      '+new',
      '+added',
      ' tail',
      '',
    ].join('\n');

    expect(parseUnifiedDiff(diff)).toEqual({
      truncated: false,
      lines: [
        { kind: 'hunk', text: '@@ -3,3 +3,4 @@ ## Plan' },
        { kind: 'context', text: 'keep', oldLine: 3, newLine: 3 },
        { kind: 'remove', text: 'old', oldLine: 4 },
        { kind: 'add', text: 'new', newLine: 4 },
        { kind: 'add', text: 'added', newLine: 5 },
        { kind: 'context', text: 'tail', oldLine: 5, newLine: 6 },
      ],
    });
  });

  it('keeps removed lines that look like headers and skips no-newline markers', () => {
    const diff = '@@ -1 +1 @@\n---- rule\n\\ No newline at end of file\n+--- rule\n';

    expect(parseUnifiedDiff(diff).lines.map((line) => [line.kind, line.text])).toEqual([
      ['hunk', '@@ -1 +1 @@'],
      ['remove', '--- rule'],
      ['add', '--- rule'],
    ]);
  });

  it('returns no lines for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual({ lines: [], truncated: false });
  });

  it('stops at the line limit', () => {
    const diff = ['@@ -1,5 +1,5 @@', '+a', '+b', '+c', '+d'].join('\n');

    expect(parseUnifiedDiff(diff, 3)).toEqual({
      truncated: true,
      lines: [
        { kind: 'hunk', text: '@@ -1,5 +1,5 @@' },
        { kind: 'add', text: 'a', newLine: 1 },
        { kind: 'add', text: 'b', newLine: 2 },
      ],
    });
  });
});
