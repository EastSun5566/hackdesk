import { useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import type { NoteComment } from '@/lib/electron-api';
import { isNoteCommentsUnavailableError } from '@/lib/note-errors';
import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS, formatDate } from './ui';
import {
  getCommentErrorMessage,
  groupCommentThreads,
  useNoteComments,
  useSetCommentResolved,
  type CommentThread,
} from './useNoteComments';

function getAuthorName(comment: NoteComment) {
  if (comment.actor.kind === 'deleted_user') return 'Deleted user';
  return comment.actor.displayName ?? 'Unknown user';
}

function CommentByline({ comment }: { comment: NoteComment }) {
  return (
    <p className="min-w-0 truncate text-xs text-text-subtle">
      <span className="font-medium text-text-default">{getAuthorName(comment)}</span>
      <span className="text-text-subtler">{` · ${formatDate(comment.createdAtMillis)}`}</span>
    </p>
  );
}

function CommentThreadCard({
  thread,
  resolved,
  busy,
  onReveal,
  onSetResolved,
}: {
  thread: CommentThread;
  resolved: boolean;
  busy: boolean;
  onReveal: (comment: NoteComment) => void;
  onSetResolved: (comment: NoteComment, resolved: boolean) => void;
}) {
  const { head, replies } = thread;

  return (
    <li
      className={cn(
        'space-y-1.5 rounded-lg border p-3 transition-colors',
        resolved
          ? 'border-border-subtle bg-background-default/60'
          : 'border-border-default bg-background-default',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CommentByline comment={head} />
        </div>
        <Button
          size="2xs"
          variant="ghost"
          disabled={busy}
          className="-my-1 -mr-1.5 shrink-0"
          onClick={() => onSetResolved(head, !resolved)}
        >
          {resolved
            ? <RotateCcw aria-hidden="true" className="size-3" />
            : <Check aria-hidden="true" className="size-3" />}
          {resolved ? 'Reopen' : 'Resolve'}
        </Button>
      </div>
      {head.excerpt ? (
        <button
          type="button"
          title="Show in note"
          aria-label={`Show “${head.excerpt}” in note`}
          className={cn(
            'block w-full truncate border-l-2 border-primary-default pl-2 text-left text-xs text-primary-default transition-colors hover:underline',
            FOCUS_RING_CLASS,
          )}
          onClick={() => onReveal(head)}
        >
          {head.excerpt}
        </button>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-xs leading-5 text-text-default">{head.body}</p>
      {replies.length > 0 ? (
        <ul aria-label="Replies" className="space-y-1.5 border-l border-border-subtle pl-2.5 pt-0.5">
          {replies.map((reply) => (
            <li key={reply.id} className="space-y-0.5">
              <CommentByline comment={reply} />
              <p className="whitespace-pre-wrap break-words text-xs leading-5 text-text-default">{reply.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** HackMD comments on the note. Renders flat Open Threads header + inline Show resolved toggle. */
export function CommentsSection({
  noteId,
  onRevealComment,
  id,
}: {
  noteId: string;
  onRevealComment: (comment: NoteComment) => boolean;
  id?: string;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const comments = useNoteComments(noteId, true);
  const setResolved = useSetCommentResolved(noteId);
  const threads = useMemo(
    () => groupCommentThreads(comments.data?.pages.flatMap((page) => page.comments) ?? []),
    [comments.data],
  );

  const reveal = (comment: NoteComment) => {
    if (!onRevealComment(comment)) toast.info("Couldn't find the commented text in this note.");
  };

  const updateResolved = (comment: NoteComment, resolved: boolean) => {
    setResolved.mutate({ commentId: comment.id, resolved }, {
      onSuccess: (result) => {
        if (result.status === 'conflict') toast.info('This thread was already updated on HackMD.');
      },
      onError: (error) => toast.error(getCommentErrorMessage(error)),
    });
  };

  const renderThreads = (list: CommentThread[], resolved: boolean, label: string) => (
    <ul aria-label={label} className="space-y-2">
      {list.map((thread) => (
        <CommentThreadCard
          key={thread.head.threadId}
          thread={thread}
          resolved={resolved}
          busy={setResolved.isPending}
          onReveal={reveal}
          onSetResolved={updateResolved}
        />
      ))}
    </ul>
  );

  return (
    <section id={id} aria-labelledby={id ? `${id}-heading` : undefined} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3
          id={id ? `${id}-heading` : undefined}
          className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-text-subtle"
        >
          Open threads
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {threads.resolved.length > 0 ? (
            <button
              type="button"
              aria-expanded={showResolved}
              aria-label={`Resolved (${threads.resolved.length})`}
              className={cn(
                'whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default',
                FOCUS_RING_CLASS,
              )}
              onClick={() => setShowResolved((current) => !current)}
            >
              {showResolved
                ? `Hide resolved (${threads.resolved.length})`
                : `Show resolved (${threads.resolved.length})`}
            </button>
          ) : null}
          <Tooltip content="Refresh comments">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Refresh comments"
              disabled={comments.isFetching}
              onClick={() => void comments.refetch()}
            >
              <RefreshCw aria-hidden="true" className={cn('size-3', comments.isFetching && 'animate-spin motion-reduce:animate-none')} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {comments.isPending ? (
        <p role="status" aria-busy="true" className="flex items-center gap-2 text-xs text-text-subtle">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
          Loading comments…
        </p>
      ) : comments.isError ? (
        (() => {
          const message = getCommentErrorMessage(comments.error);
          return isNoteCommentsUnavailableError(message) ? (
            <p className="text-xs text-text-subtle">{message}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-text-subtle">Could not load comments. {message}</p>
              <Button size="xs" variant="secondary" onClick={() => void comments.refetch()}>Retry</Button>
            </div>
          );
        })()
      ) : (
        <div className="space-y-2">
          {threads.open.length > 0
            ? renderThreads(threads.open, false, 'Open comments')
            : <p className="text-xs text-text-subtle">{threads.resolved.length > 0 ? 'No open comments.' : 'No comments on this note.'}</p>}
          {threads.resolved.length > 0 && showResolved
            ? renderThreads(threads.resolved, true, 'Resolved comments')
            : null}
          {comments.hasNextPage ? (
            <Button size="xs" variant="secondary" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
              {comments.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
