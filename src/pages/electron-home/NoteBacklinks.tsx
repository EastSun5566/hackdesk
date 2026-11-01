import { useQuery } from '@tanstack/react-query';

import { getHackDeskAPI, type DocumentSummary } from '@/lib/electron-api';
import type { NoteBacklinksInput, NoteLinkTarget } from '@/lib/note-index';

import { CollapsibleSection } from './interaction-primitives';
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

/** Notes that link to or embed this one, from the local index only. */
export function BacklinksSection({ document, onOpenNote, defaultOpen = false }: {
  document: DocumentSummary;
  onOpenNote: OpenNoteTarget;
  defaultOpen?: boolean;
}) {
  const noteIndex = getHackDeskAPI()?.noteIndex;
  const target = getBacklinksTarget(document);
  const backlinks = useQuery({
    queryKey: ['note-backlinks', target],
    queryFn: () => noteIndex!.backlinks({ target: target! }),
    enabled: Boolean(noteIndex && target),
  });
  if (!noteIndex || !target) return null;
  const notes = backlinks.data?.notes ?? [];

  return (
    <CollapsibleSection
      title="Linked from"
      subtitle={backlinks.data ? `${notes.length}` : undefined}
      defaultOpen={defaultOpen}
      contentClassName="space-y-2 pb-3 pt-1.5"
    >
      {backlinks.isPending ? (
        <p role="status" aria-busy="true" className="text-xs text-text-subtle">Finding links…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-text-subtle">No other notes link here.</p>
      ) : (
        <ul className="space-y-1">
          {notes.map(note => (
            <li key={`${note.kind}:${note.kind === 'local' ? note.vaultId : note.teamPath}:${note.noteId}`} className="min-w-0">
              {/* Inside the metadata form, so it must not submit. */}
              <button
                type="button"
                className="w-full min-w-0 rounded-sm px-1.5 py-1 text-left hover:bg-background-selected focus-visible:outline-2 focus-visible:outline-focus-ring"
                onClick={() => onOpenNote(toRecentNote(note))}
              >
                <span className="block truncate text-sm text-text-default">{note.title || 'Untitled'}</span>
                <span className="block truncate text-xs text-text-subtle">{workspaceLabel(note)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {target.source === 'hackmd' ? (
        <p className="text-xs text-text-subtle">From notes you&apos;ve opened and your Local Vault.</p>
      ) : null}
    </CollapsibleSection>
  );
}
