import { createContext, useContext } from 'react';
import { Folder } from 'lucide-react';

import type { FolderTreeNote } from '@/lib/hackmd-folders';

import { formatDate } from './ui';

export const NOTE_CARD_CLASS = 'w-64 max-w-64 rounded-md border-border-default bg-background-raised px-3 py-2.5 text-sm font-normal leading-5 text-text-default shadow-lg drop-shadow-none';

/** The hover card for a note row: the full title, then where it lives, its tags and when it changed. */
export function NoteSummaryCard({ entry }: { entry: FolderTreeNote }) {
  const { note } = entry;
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-text-emphasize text-pretty">{note.title || 'Untitled'}</p>
      {entry.folderLabel ? (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-text-subtle">
          <Folder aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{entry.folderLabel}</span>
        </p>
      ) : null}
      {note.tags.length ? (
        <p className="flex flex-wrap gap-1">
          {note.tags.map((tag) => (
            <span key={tag} className="rounded-sm bg-background-hover px-1.5 text-xs leading-5 text-text-default">{tag}</span>
          ))}
        </p>
      ) : null}
      {note.updatedAtMillis ? <p className="text-xs text-text-subtle">Edited {formatDate(note.updatedAtMillis)}</p> : null}
    </div>
  );
}

/**
 * Finds a note as the sidebar lists it (with its folder), by note ID. Lets surfaces outside the
 * tree, such as the tabs, show the same card without threading the tree through their props.
 */
export const NoteSummaryLookupContext = createContext<(noteId: string) => FolderTreeNote | undefined>(() => undefined);

export function useNoteSummaryLookup() {
  return useContext(NoteSummaryLookupContext);
}

/** Team names by team path, so surfaces such as the note breadcrumb can name a team workspace. */
export const TeamNameLookupContext = createContext<(teamPath: string) => string | undefined>(() => undefined);

/** The active vault's folder name, so surfaces such as the note breadcrumb can name a local workspace. */
export const LocalVaultNameContext = createContext<string | null>(null);

export function useTeamNameLookup() {
  return useContext(TeamNameLookupContext);
}
