import type { FolderTreeNote } from './hackmd-folders';

/** How tag groups order themselves: by tag name, or by each group's most recently updated note. */
export type TagGroupOrder = 'a-z' | 'updated-desc' | 'updated-asc';

export const DEFAULT_TAG_GROUP_ORDER: TagGroupOrder = 'updated-desc';

export const TAG_GROUP_ORDER_MODES: TagGroupOrder[] = ['a-z', 'updated-desc', 'updated-asc'];

export const TAG_GROUP_ORDER_LABELS: Record<TagGroupOrder, string> = {
  'a-z': 'Tag A-Z',
  'updated-desc': 'Recently updated',
  'updated-asc': 'Oldest updated',
};

export function normalizeTagGroupOrder(value: unknown): TagGroupOrder {
  return value === 'a-z' || value === 'updated-desc' || value === 'updated-asc' ? value : DEFAULT_TAG_GROUP_ORDER;
}

/** A tag group row's focus id in the folder tree; '' (no tags) reads as the untagged group. */
export function createTagGroupFocusId(tag: string) {
  return `tag:${tag || '__untagged__'}`;
}

export function getTagGroupLabel(tag: string) {
  return tag || 'Untagged';
}

export type TagGroup = {
  /** The note's first tag, or '' for notes without tags. */
  tag: string;
  /** Reads as the tag name, or "Untagged" for the trailing tagless group. */
  label: string;
  entries: FolderTreeNote[];
  /** The group's newest note, how the updated-time orders rank groups. */
  latestUpdatedAtMillis: number | null;
};

function getFirstTag(entry: FolderTreeNote) {
  const tag = entry.note.tags.find((candidate) => candidate && candidate.trim());
  return tag ? tag.trim() : '';
}

function getGroupLatestUpdatedAtMillis(entries: FolderTreeNote[]) {
  let latest: number | null = null;
  for (const entry of entries) {
    const millis = entry.note.updatedAtMillis;
    if (millis && (!latest || millis > latest)) latest = millis;
  }
  return latest;
}

/**
 * The pre-folder legacy view for root notes: each note groups under its first tag. Notes without
 * tags group under "Untagged", an ordinary group that sorts with the rest by the chosen order.
 */
export function groupNotesByFirstTag(entries: FolderTreeNote[], order: TagGroupOrder): TagGroup[] {
  const groups = new Map<string, FolderTreeNote[]>();
  for (const entry of entries) {
    const tag = getFirstTag(entry);
    const group = groups.get(tag);
    if (group) group.push(entry);
    else groups.set(tag, [entry]);
  }

  const ordered: TagGroup[] = [...groups].map(([tag, groupEntries]) => ({
    tag,
    label: getTagGroupLabel(tag),
    entries: groupEntries,
    latestUpdatedAtMillis: getGroupLatestUpdatedAtMillis(groupEntries),
  }));
  // Array#sort is stable, so same-time groups (all with no dates, say) stay in tag order.
  if (order === 'updated-desc') {
    ordered.sort((left, right) => (right.latestUpdatedAtMillis ?? Number.NEGATIVE_INFINITY) - (left.latestUpdatedAtMillis ?? Number.NEGATIVE_INFINITY));
  } else if (order === 'updated-asc') {
    ordered.sort((left, right) => (left.latestUpdatedAtMillis ?? Number.POSITIVE_INFINITY) - (right.latestUpdatedAtMillis ?? Number.POSITIVE_INFINITY));
  } else {
    ordered.sort((left, right) => left.label.localeCompare(right.label));
  }
  return ordered;
}
