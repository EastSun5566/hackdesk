import { parseDiffFromFile, parsePatchFiles } from '@pierre/diffs';
import { comparisonTooLarge, normalizeComparisonPatch, type NoteComparison } from './note-comparison';

export function parseNoteComparison(input: NoteComparison) {
  if (comparisonTooLarge(input)) throw new Error('Comparison exceeds the rendering limit.');

  if (input.kind === 'text') return [parseDiffFromFile(
    { name: 'note.md', contents: input.before }, { name: 'note.md', contents: input.after },
    { context: 3 }, true,
  )];
  const patch = normalizeComparisonPatch(input.patch);
  if (!patch) return [];
  const parsed = parsePatchFiles(patch, undefined, true).flatMap((item) => item.files);
  if (parsed.length !== 1 || !parsed[0].hunks.length) throw new Error('Expected one note comparison.');
  return parsed;
}
