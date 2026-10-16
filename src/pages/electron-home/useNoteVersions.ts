import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getHackDeskAPI, type CreateNoteVersionInput, type NoteVersionPage } from '@/lib/electron-api';
import { runHackmdRequest } from '@/lib/hackmd-requests';
import { isNoteVersionsUnavailableError, stripIpcErrorPrefix } from '@/lib/note-errors';

const VERSION_PAGE_SIZE = 20;
export const VERSION_PREVIEW_SIZE = 3;

/** Every version query of a note sits under one prefix, so one invalidation refreshes them all. */
export const noteVersionsKeys = {
  all: (noteId: string) => ['electron', 'hackmd', 'note-versions', noteId] as const,
  list: (noteId: string, namedOnly: boolean) => [...noteVersionsKeys.all(noteId), 'list', { namedOnly }] as const,
  preview: (noteId: string) => [...noteVersionsKeys.all(noteId), 'preview'] as const,
  detail: (noteId: string, versionId: string) => [...noteVersionsKeys.all(noteId), 'detail', versionId] as const,
  diff: (noteId: string, versionId: string) => [...noteVersionsKeys.all(noteId), 'diff', versionId] as const,
};

function requireApi() {
  const api = getHackDeskAPI();
  if (!api) throw new Error('Version history needs the HackDesk desktop app.');
  return api.hackmd;
}

// "Unavailable" is HackMD's answer for this note, so retrying will not change it.
function retryUnlessUnavailable(failureCount: number, error: Error) {
  return failureCount < 1 && !isNoteVersionsUnavailableError(error.message);
}

export function getVersionErrorMessage(error: unknown) {
  return error instanceof Error ? stripIpcErrorPrefix(error.message) : 'Could not load version history.';
}

export function useNoteVersionList(noteId: string, namedOnly: boolean, enabled = true) {
  return useInfiniteQuery({
    queryKey: noteVersionsKeys.list(noteId, namedOnly),
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const hackmd = requireApi();
      return runHackmdRequest(hackmd, signal, hackmd.listNoteVersions, [noteId, { namedOnly, page: pageParam, limit: VERSION_PAGE_SIZE }]);
    },
    getNextPageParam: (page: NoteVersionPage) => (page.page < page.totalPages ? page.page + 1 : undefined),
    retry: retryUnlessUnavailable,
  });
}

export function useNoteVersionPreview(noteId: string) {
  return useQuery({
    queryKey: noteVersionsKeys.preview(noteId),
    queryFn: ({ signal }) => {
      const hackmd = requireApi();
      return runHackmdRequest(hackmd, signal, hackmd.listNoteVersions, [noteId, { limit: VERSION_PREVIEW_SIZE }]);
    },
    retry: retryUnlessUnavailable,
  });
}

export function useNoteVersionContent(noteId: string, versionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: noteVersionsKeys.detail(noteId, versionId ?? ''),
    enabled: enabled && !!versionId,
    // A saved version never changes.
    staleTime: Infinity,
    queryFn: ({ signal }) => {
      const hackmd = requireApi();
      return runHackmdRequest(hackmd, signal, hackmd.getNoteVersion, [noteId, versionId!]);
    },
    retry: retryUnlessUnavailable,
  });
}

export function useNoteVersionDiff(noteId: string, versionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: noteVersionsKeys.diff(noteId, versionId ?? ''),
    enabled: enabled && !!versionId,
    queryFn: ({ signal }) => {
      const hackmd = requireApi();
      return runHackmdRequest(hackmd, signal, hackmd.compareNoteVersions, [noteId, `version:${versionId!}`, 'note_content']);
    },
    retry: retryUnlessUnavailable,
  });
}

export function useCreateNoteVersion(noteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteVersionInput) => requireApi().createNoteVersion(noteId, input),
    onSuccess: (result) => {
      if (result.status === 'created') {
        void queryClient.invalidateQueries({ queryKey: noteVersionsKeys.all(noteId) });
      }
    },
  });
}
