import { describe, expect, it } from 'vitest';
import { comparisonTooLarge } from './note-comparison';
import { parseNoteComparison } from './parse-note-comparison';

describe('note comparison', () => {
  it('adapts bare hunks without using a note title and preserves direction and Chinese text', () => {
    const patch = '@@ -1 +1 @@\r\n-舊內容\r\n+新內容\r\n';
    const [file] = parseNoteComparison({ kind: 'patch', patch });
    expect(file.name).toBe('b/note.md');
    expect(file.deletionLines.join('')).toBe('舊內容\n');
    expect(file.additionLines.join('')).toBe('新內容\n');
    expect(parseNoteComparison({ kind: 'patch', patch: `--- a/note.md\n+++ b/note.md\n${patch}` })[0].hunks).toEqual(file.hunks);
  });

  it('preserves missing final newlines and compares both complete sides', () => {
    const [file] = parseNoteComparison({ kind: 'text', before: 'before', after: 'after' });
    expect(file.deletionLines.join('')).toBe('before');
    expect(file.additionLines.join('')).toBe('after');
    const [patch] = parseNoteComparison({ kind: 'patch', patch: '@@ -1 +1 @@\n-before\n\\ No newline at end of file\n+after\n\\ No newline at end of file\n' });
    expect(patch.hunks[0]).toMatchObject({ noEOFCRAdditions: true, noEOFCRDeletions: true });
  });

  it('accepts an empty diff, but rejects invalid or incomplete patches', () => {
    expect(parseNoteComparison({ kind: 'patch', patch: '' })).toEqual([]);
    for (const patch of ['garbage', '@@ nope\n+x', '@@ -1,2 +1 @@\n-old\n+new\n', '--- a/note.md\n+++ b/note.md\n']) {
      expect(() => parseNoteComparison({ kind: 'patch', patch })).toThrow();
    }
  });

  it('checks combined line and UTF-8 byte limits before parsing', () => {
    expect(comparisonTooLarge({ kind: 'text', before: 'a\n'.repeat(2500), after: 'b\n'.repeat(2500) })).toBe(false);
    expect(comparisonTooLarge({ kind: 'text', before: 'a\n'.repeat(2500), after: 'b\n'.repeat(2501) })).toBe(true);
    const input = { kind: 'patch' as const, patch: '中'.repeat(350_000) };
    expect(comparisonTooLarge(input)).toBe(true);
    expect(() => parseNoteComparison(input)).toThrow('rendering limit');
  });
});
