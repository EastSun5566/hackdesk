import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';

import { getHackDeskAPI, type DocumentSummary } from '@/lib/electron-api';
import type { NoteBacklinksInput, NoteLinkTarget } from '@/lib/note-index';

import { getLocalImageContext, LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { toRecentNote, type OpenNoteTarget } from './useNoteLinkOpener';

/** What other notes' links to `document` are matched against; null for a draft. */
export function getBacklinksTarget(document: DocumentSummary): NoteBacklinksInput['target'] | null {
  if (!document.id) return null;
  if (document.teamPath === LOCAL_VAULT_TEAM_PATH) {
    const local = getLocalImageContext(document);
    return local ? { source: 'local', vaultId: local.vaultId, noteId: document.id } : null;
  }
  return {
    source: 'hackmd',
    id: document.id,
    shortId: document.shortId,
    permalink: document.permalink,
    userPath: document.userPath,
    teamPath: document.teamPath,
  };
}

const workspaceLabel = (note: NoteLinkTarget) => {
  if (note.kind === 'local') return 'Local Vault';
  return note.teamPath ? `Team: ${note.teamPath}` : 'My Workspace';
};

export function useNoteBacklinks(document: DocumentSummary, enabled = true) {
  const noteIndex = getHackDeskAPI()?.noteIndex;
  const target = getBacklinksTarget(document);
  const query = useQuery({
    queryKey: ['note-backlinks', target],
    queryFn: () => noteIndex!.backlinks({ target: target! }),
    enabled: Boolean(enabled && noteIndex && target),
  });
  return {
    available: Boolean(noteIndex && target),
    target,
    query,
  };
}

/** Notes that link to or embed this one, from the local index only. */
export function BacklinksSection({
  document,
  onOpenNote,
  id,
}: {
  document: DocumentSummary;
  onOpenNote: OpenNoteTarget;
  id?: string;
}) {
  const { available, query: backlinks } = useNoteBacklinks(document);
  if (!available) return null;
  const notes = backlinks.data?.notes ?? [];

  return (
    <section id={id} aria-labelledby={id ? `${id}-heading` : undefined} className="space-y-2">
      <h3
        id={id ? `${id}-heading` : undefined}
        className="text-xs font-medium uppercase tracking-wide text-text-subtle"
      >
        Linked from{backlinks.data ? ` · ${notes.length}` : ''}
      </h3>
      {backlinks.isPending ? (
        <p role="status" aria-busy="true" className="text-xs text-text-subtle">Finding links…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-text-subtle">No other notes link here.</p>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-default bg-background-default">
          {notes.map((note) => (
            <li key={`${note.kind}:${note.kind === 'local' ? note.vaultId : note.teamPath}:${note.noteId}`} className="min-w-0">
              <button
                type="button"
                className="group flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
                onClick={() => onOpenNote(toRecentNote(note))}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-menu font-medium text-text-default">{note.title || 'Untitled'}</span>
                  <span className="block truncate text-xs text-text-subtle">{workspaceLabel(note)}</span>
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-text-subtler transition-colors group-hover:text-text-default"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
