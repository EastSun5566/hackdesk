import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getHackDeskAPI, type NoteComment, type NoteCommentPage } from '@/lib/electron-api';
import { runHackmdRequest } from '@/lib/hackmd-requests';
import { isNoteCommentsUnavailableError, stripIpcErrorPrefix } from '@/lib/note-errors';

export const noteCommentsKeys = {
  all: (noteId: string) => ['electron', 'hackmd', 'note-comments', noteId] as const,
};

export type CommentThread = {
  head: NoteComment;
  replies: NoteComment[];
};

function requireApi() {
  const api = getHackDeskAPI();
  if (!api) throw new Error('Comments need the HackDesk desktop app.');
  return api.hackmd;
}

export function getCommentErrorMessage(error: unknown) {
  return error instanceof Error ? stripIpcErrorPrefix(error.message) : 'Could not load comments.';
}

function byCreatedAt(left: NoteComment, right: NoteComment) {
  return (left.createdAtMillis ?? 0) - (right.createdAtMillis ?? 0);
}

/**
 * Groups comments into threads. Resolved threads are kept apart; threads and
 * replies hidden for other reasons, such as spam, are left out.
 */
export function groupCommentThreads(comments: NoteComment[]): { open: CommentThread[]; resolved: CommentThread[] } {
  const heads = new Map<string, NoteComment>();
  const replies = new Map<string, NoteComment[]>();
  for (const comment of comments) {
    if (comment.isThreadHead) {
      heads.set(comment.threadId, comment);
    } else if (comment.status === 'open') {
      replies.set(comment.threadId, [...(replies.get(comment.threadId) ?? []), comment]);
    }
  }

  const open: CommentThread[] = [];
  const resolved: CommentThread[] = [];
  for (const head of [...heads.values()].sort(byCreatedAt)) {
    const thread = { head, replies: (replies.get(head.threadId) ?? []).sort(byCreatedAt) };
    if (head.threadStatus === 'hidden') {
      if (head.threadStatusReason === 'resolved') resolved.push(thread);
    } else if (head.status === 'open') {
      open.push(thread);
    }
  }

  return { open, resolved };
}

export function useNoteComments(noteId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: noteCommentsKeys.all(noteId),
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const hackmd = requireApi();
      return runHackmdRequest(hackmd, signal, hackmd.listNoteComments, [noteId, { page: pageParam }]);
    },
    getNextPageParam: (page: NoteCommentPage) => (page.hasNext ? page.page + 1 : undefined),
    // "Unavailable" is HackMD's answer for this note, so retrying will not change it.
    retry: (failureCount, error) => failureCount < 1 && !isNoteCommentsUnavailableError(error.message),
  });
}

export function useSetCommentResolved(noteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) => (
      requireApi().setNoteCommentResolved(noteId, commentId, resolved)
    ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: noteCommentsKeys.all(noteId) }),
  });
}
