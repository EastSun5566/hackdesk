import { useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import type { NoteComment } from '@/lib/electron-api';
import { isNoteCommentsUnavailableError } from '@/lib/note-errors';
import { cn } from '@/lib/utils';

import { CollapsibleSection } from './interaction-primitives';
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
    <p className="truncate text-xs text-text-subtle">
      <span className="font-medium text-text-default">{getAuthorName(comment)}</span>
      {' · '}
      {formatDate(comment.createdAtMillis)}
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
    <li className="space-y-1.5 rounded-md border border-border-default bg-background-default p-2.5">
      <CommentByline comment={head} />
      {head.excerpt ? (
        <button
          type="button"
          title="Show in note"
          aria-label={`Show “${head.excerpt}” in note`}
          className={cn(
            'block w-full truncate rounded-sm border-l-2 border-primary-default pl-2 text-left text-xs text-text-subtle hover:text-text-default',
            FOCUS_RING_CLASS,
          )}
          onClick={() => onReveal(head)}
        >
          {head.excerpt}
        </button>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-sm text-text-default">{head.body}</p>
      {replies.length > 0 ? (
        <ul aria-label="Replies" className="space-y-1.5 border-l border-border-default pl-2.5">
          {replies.map((reply) => (
            <li key={reply.id}>
              <CommentByline comment={reply} />
              <p className="whitespace-pre-wrap break-words text-sm text-text-default">{reply.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex justify-end">
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => onSetResolved(head, !resolved)}>
          {resolved
            ? <RotateCcw aria-hidden="true" className="size-3.5" />
            : <Check aria-hidden="true" className="size-3.5" />}
          {resolved ? 'Reopen' : 'Resolve'}
        </Button>
      </div>
    </li>
  );
}

function CommentsBody({
  noteId,
  onRevealComment,
}: {
  noteId: string;
  onRevealComment: (comment: NoteComment) => boolean;
}) {
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

  if (comments.isPending) {
    return (
      <p role="status" aria-busy="true" className="flex items-center gap-2 text-xs text-text-subtle">
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
        Loading comments…
      </p>
    );
  }

  if (comments.isError) {
    const message = getCommentErrorMessage(comments.error);
    return isNoteCommentsUnavailableError(message) ? (
      <p className="text-xs text-text-subtle">{message}</p>
    ) : (
      <div className="space-y-2">
        <p className="text-xs text-text-subtle">Could not load comments. {message}</p>
        <Button size="xs" variant="secondary" onClick={() => void comments.refetch()}>Retry</Button>
      </div>
    );
  }

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
    <div className="space-y-2">
      {threads.open.length > 0
        ? renderThreads(threads.open, false, 'Open comments')
        : <p className="text-xs text-text-subtle">{threads.resolved.length > 0 ? 'No open comments.' : 'No comments on this note.'}</p>}
      {threads.resolved.length > 0 ? (
        <CollapsibleSection
          title={`Resolved (${threads.resolved.length})`}
          defaultOpen={false}
          contentClassName="pt-2"
        >
          {renderThreads(threads.resolved, true, 'Resolved comments')}
        </CollapsibleSection>
      ) : null}
      {comments.hasNextPage ? (
        <Button size="xs" variant="secondary" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
          {comments.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}

/** HackMD comments on the note. Fetches only after the section is first opened. */
export function CommentsSection({
  noteId,
  onRevealComment,
}: {
  noteId: string;
  onRevealComment: (comment: NoteComment) => boolean;
}) {
  const [opened, setOpened] = useState(false);
  const comments = useNoteComments(noteId, false);
  const openCount = useMemo(
    () => (comments.data ? groupCommentThreads(comments.data.pages.flatMap((page) => page.comments)).open.length : null),
    [comments.data],
  );

  return (
    <CollapsibleSection
      title="Comments"
      subtitle={openCount === null ? undefined : `${openCount} open`}
      defaultOpen={false}
      onOpenChange={(open) => {
        if (open) setOpened(true);
      }}
      actions={opened ? (
        <Tooltip content="Refresh comments">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Refresh comments"
            disabled={comments.isFetching}
            onClick={() => void comments.refetch()}
          >
            <RefreshCw aria-hidden="true" className={cn('size-3.5', comments.isFetching && 'animate-spin motion-reduce:animate-none')} />
          </Button>
        </Tooltip>
      ) : undefined}
      contentClassName="pb-3 pt-1.5"
    >
      {opened ? <CommentsBody noteId={noteId} onRevealComment={onRevealComment} /> : null}
    </CollapsibleSection>
  );
}
