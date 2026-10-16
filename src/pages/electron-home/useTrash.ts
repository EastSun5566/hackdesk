import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getHackDeskAPI, type RestoreTrashResult, type TrashedNoteSummary } from '@/lib/electron-api';
import { runHackmdRequest } from '@/lib/hackmd-requests';
import { stripIpcErrorPrefix } from '@/lib/note-errors';

import { getWorkspaceQueryKey } from './repository';

export const trashKeys = {
  list: ['electron', 'hackmd', 'trash'] as const,
};

function requireApi() {
  const api = getHackDeskAPI();
  if (!api) throw new Error('The trash needs the HackDesk desktop app.');
  return api.hackmd;
}

export function getTrashErrorMessage(error: unknown) {
  return error instanceof Error ? stripIpcErrorPrefix(error.message) : 'Could not load the trash.';
}

export function useTrashList(enabled: boolean) {
  return useQuery({
    queryKey: trashKeys.list,
    enabled,
    queryFn: ({ signal }) => {
      const hackmd = requireApi();
      return runHackmdRequest(hackmd, signal, hackmd.listTrash, []);
    },
  });
}

export function getRestoredIds(result: RestoreTrashResult) {
  return Object.entries(result).flatMap(([noteId, outcome]) => (outcome.status === 'success' ? [noteId] : []));
}

/** Restores notes and refreshes every list they come back to. */
export function useRestoreNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteIds: string[]) => requireApi().restoreNotes(noteIds),
    onSuccess: (result) => {
      const restored = new Set(getRestoredIds(result));
      if (restored.size === 0) return;
      queryClient.setQueryData<TrashedNoteSummary[]>(
        trashKeys.list,
        (notes) => notes?.filter((note) => !restored.has(note.id)),
      );
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey({ type: 'personal', label: 'My Workspace' }) });
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey({ type: 'history', label: 'History' }) });
      for (const noteId of restored) {
        void queryClient.invalidateQueries({ queryKey: ['electron', 'hackmd', 'note', null, noteId] });
      }
    },
  });
}
