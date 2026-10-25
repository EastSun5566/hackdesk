export type NoteComparison =
  | { kind: 'patch'; patch: string }
  | { kind: 'text'; before: string; after: string };

export const COMPARISON_MAX_LINES = 5_000;
export const COMPARISON_MAX_BYTES = 1024 * 1024;

export function comparisonTexts(input: NoteComparison) {
  return input.kind === 'patch' ? [input.patch] : [input.before, input.after];
}

export function comparisonTooLarge(input: NoteComparison) {
  const texts = comparisonTexts(input);
  return texts.reduce((sum, text) => sum + (text ? text.split('\n').length - Number(text.endsWith('\n')) : 0), 0) > COMPARISON_MAX_LINES
    || texts.reduce((sum, text) => sum + new TextEncoder().encode(text).length, 0) > COMPARISON_MAX_BYTES;
}

/** HackMD also returns bare hunks. File names here are deliberately independent of note titles. */
export function normalizeComparisonPatch(patch: string) {
  const normalized = patch.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return '';
  if (!/^(?:@@ |--- |diff --git )/.test(normalized)) throw new Error('Invalid unified patch.');
  return normalized.startsWith('@@ ')
    ? `--- a/note.md\n+++ b/note.md\n${normalized}`
    : normalized;
}
