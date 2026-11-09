import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getHackDeskAPI, type RestoreTrashResult, type TrashedNoteSummary } from '@/lib/electron-api';
import { runHackmdRequest } from '@/lib/hackmd-requests';
import { stripIpcErrorPrefix } from '@/lib/note-errors';

import { getWorkspaceQueryKey } from './repository';
import type { WorkspaceScope } from './types';

/** The most note ids one restore request carries. A larger selection is sent in batches. */
const RESTORE_BATCH_SIZE = 100;

export const trashKeys = {
  list: ['electron', 'hackmd', 'trash'] as const,
};

export function trashListQueryKey(teamPath: string | null) {
  return [...trashKeys.list, teamPath] as const;
}

export function trashTeamPathForScope(scope: WorkspaceScope): string | null | undefined {
  if (scope.type === 'personal') return null;
  if (scope.type === 'team') return scope.teamPath;
  return undefined;
}

function requireApi() {
  const api = getHackDeskAPI();
  if (!api) throw new Error('The trash needs the HackDesk desktop app.');
  return api.hackmd;
}

export function getTrashErrorMessage(error: unknown) {
  return error instanceof Error ? stripIpcErrorPrefix(error.message) : 'Could not load the trash.';
}

export function useTrashList(enabled: boolean, teamPath: string | null) {
  return useQuery({
    queryKey: trashListQueryKey(teamPath),
    enabled,
    queryFn: ({ signal }) => {
      const hackmd = requireApi();
      return runHackmdRequest(hackmd, signal, hackmd.listTrash, [teamPath]);
    },
  });
}

export function getRestoredIds(result: RestoreTrashResult) {
  return Object.entries(result).flatMap(([noteId, outcome]) => (outcome.status === 'success' ? [noteId] : []));
}

/** Restores notes and refreshes every list they come back to. */
export function useRestoreNotes(scope: WorkspaceScope) {
  const queryClient = useQueryClient();
  const teamPath = trashTeamPathForScope(scope);
  const listKey = teamPath === undefined ? null : trashListQueryKey(teamPath);
  return useMutation({
    mutationFn: async (noteIds: string[]) => {
      const hackmd = requireApi();
      const result: RestoreTrashResult = {};
      for (let start = 0; start < noteIds.length; start += RESTORE_BATCH_SIZE) {
        try {
          Object.assign(result, await hackmd.restoreNotes(noteIds.slice(start, start + RESTORE_BATCH_SIZE)));
        } catch (error) {
          if (start === 0) throw error;
          // Earlier batches went through, so report the rest as failed instead of losing those results.
          for (const noteId of noteIds.slice(start)) result[noteId] = { status: 'failure', reason: 'UNKNOWN' };
          break;
        }
      }
      return result;
    },
    onSuccess: (result) => {
      const restored = new Set(getRestoredIds(result));
      if (restored.size === 0) return;
      if (listKey) {
        queryClient.setQueryData<TrashedNoteSummary[]>(
          listKey,
          (notes) => notes?.filter((note) => !restored.has(note.id)),
        );
      }
      if (scope.type === 'personal' || scope.type === 'team') {
        void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
      }
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey({ type: 'history', label: 'History' }) });
      for (const noteId of restored) {
        const noteTeamPath = scope.type === 'team' ? scope.teamPath : null;
        void queryClient.invalidateQueries({ queryKey: ['electron', 'hackmd', 'note', noteTeamPath, noteId] });
      }
    },
  });
}
