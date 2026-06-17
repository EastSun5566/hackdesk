import type { FolderTreeNote } from './hackmd-folders';

export type ElectronNoteTag = {
  tag: string;
  count: number;
  latestUpdatedAtMillis: number | null;
};

function normalizeTag(tag: string) {
  return tag.trim();
}

function compareNullableMillisDesc(left: number | null, right: number | null) {
  return (right ?? 0) - (left ?? 0);
}

export function buildNoteTagIndex(entries: FolderTreeNote[]): ElectronNoteTag[] {
  const tagsByName = new Map<string, ElectronNoteTag>();

  for (const entry of entries) {
    const noteTags = new Set(entry.note.tags.map(normalizeTag).filter(Boolean));

    for (const tag of noteTags) {
      const existing = tagsByName.get(tag);
      if (existing) {
        existing.count += 1;
        if ((entry.note.updatedAtMillis ?? 0) > (existing.latestUpdatedAtMillis ?? 0)) {
          existing.latestUpdatedAtMillis = entry.note.updatedAtMillis;
        }
      } else {
        tagsByName.set(tag, {
          tag,
          count: 1,
          latestUpdatedAtMillis: entry.note.updatedAtMillis,
        });
      }
    }
  }

  return [...tagsByName.values()].sort((left, right) => (
    right.count - left.count
    || left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' })
    || compareNullableMillisDesc(left.latestUpdatedAtMillis, right.latestUpdatedAtMillis)
  ));
}
