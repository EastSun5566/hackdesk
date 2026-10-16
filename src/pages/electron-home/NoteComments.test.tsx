import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { NoteComment, NoteCommentPage } from '@/lib/electron-api';
import { HACKMD_NOTE_COMMENTS_UNAVAILABLE_MESSAGE } from '@/lib/note-errors';

import { CommentsSection } from './NoteComments';

vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function comment(overrides: Partial<NoteComment>): NoteComment {
  return {
    id: 'c', threadId: 't', actor: { kind: 'user', displayName: 'Ada' }, body: '', status: 'open', statusReason: null,
    isThreadHead: true, threadStatus: 'open', threadStatusReason: null, anchor: null, currentAnchor: null, excerpt: null,
    createdAtMillis: Date.UTC(2026, 9, 15, 12), updatedAtMillis: null, ...overrides,
  };
}

const openHead = comment({ id: 'c-1', threadId: 't-1', body: 'Should this be Q4?', excerpt: 'ship date', currentAnchor: { offset: 6, length: 9 } });
const reply = comment({ id: 'c-2', threadId: 't-1', isThreadHead: false, threadStatus: null, actor: { kind: 'deleted_user', displayName: null }, body: 'Yes, moved it.' });
const resolvedHead = comment({ id: 'c-3', threadId: 't-2', body: 'Typo here', threadStatus: 'hidden', threadStatusReason: 'resolved' });

function installApi(overrides: Partial<NonNullable<typeof window.hackdeskAPI>['hackmd']> = {}) {
  const hackmd = {
    listNoteComments: vi.fn(async (): Promise<NoteCommentPage> => ({ comments: [openHead, reply, resolvedHead], page: 1, hasNext: false })),
    setNoteCommentResolved: vi.fn(async () => ({ status: 'updated' as const })),
    ...overrides,
  };
  window.hackdeskAPI = { hackmd } as unknown as NonNullable<typeof window.hackdeskAPI>;
  return hackmd;
}

function renderSection(onRevealComment = vi.fn(() => true)) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CommentsSection noteId="note-1" onRevealComment={onRevealComment} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onRevealComment };
}

async function openSection() {
  fireEvent.click(screen.getByRole('button', { name: /^Comments/ }));
  return screen.findByRole('list', { name: 'Open comments' });
}

describe('CommentsSection', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('loads comments only once opened and lists open threads with replies', async () => {
    const hackmd = installApi();
    renderSection();

    expect(hackmd.listNoteComments).not.toHaveBeenCalled();
    const open = await openSection();

    expect(hackmd.listNoteComments).toHaveBeenCalledWith('note-1', { page: 1 });
    expect(within(open).getByText('Should this be Q4?')).toBeInTheDocument();
    expect(within(open).getByRole('list', { name: 'Replies' })).toHaveTextContent('Deleted user');
    expect(within(open).queryByText('Typo here')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Comments/ })).toHaveAccessibleName(/1 open/);
    expect(screen.getByRole('button', { name: /^Resolved \(1\)/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the commented text in the note, and says when it is not found', async () => {
    installApi();
    const { onRevealComment } = renderSection(vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false));
    await openSection();

    const excerpt = screen.getByRole('button', { name: 'Show “ship date” in note' });
    fireEvent.click(excerpt);
    expect(onRevealComment).toHaveBeenCalledWith(openHead);
    expect(toast.info).not.toHaveBeenCalled();

    fireEvent.click(excerpt);
    expect(toast.info).toHaveBeenCalledWith("Couldn't find the commented text in this note.");
  });

  it('resolves an open thread and reopens a resolved one, then reloads', async () => {
    const hackmd = installApi();
    renderSection();
    const open = await openSection();

    fireEvent.click(within(open).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(hackmd.setNoteCommentResolved).toHaveBeenCalledWith('note-1', 'c-1', true));
    await waitFor(() => expect(hackmd.listNoteComments).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: /^Resolved \(1\)/ }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Resolved comments' })).getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(hackmd.setNoteCommentResolved).toHaveBeenCalledWith('note-1', 'c-3', false));
  });

  it('explains a conflict and a refused resolution', async () => {
    installApi({
      setNoteCommentResolved: vi.fn()
        .mockResolvedValueOnce({ status: 'conflict' })
        .mockRejectedValueOnce(new Error("You can't resolve comments on this note.")),
    });
    renderSection();
    const open = await openSection();

    fireEvent.click(within(open).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('This thread was already updated on HackMD.'));
    await waitFor(() => expect(within(open).getByRole('button', { name: 'Resolve' })).toBeEnabled());
    fireEvent.click(within(open).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You can't resolve comments on this note."));
  });

  it('says when a note has no comments', async () => {
    installApi({ listNoteComments: vi.fn(async () => ({ comments: [], page: 1, hasNext: false })) });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /^Comments/ }));
    expect(await screen.findByText('No comments on this note.')).toBeInTheDocument();
  });

  it('does not retry when HackMD does not offer comments for the note', async () => {
    const listNoteComments = vi.fn(async () => { throw new Error(HACKMD_NOTE_COMMENTS_UNAVAILABLE_MESSAGE); });
    installApi({ listNoteComments });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /^Comments/ }));

    expect(await screen.findByText(HACKMD_NOTE_COMMENTS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('offers Retry after another failure', async () => {
    // The hook retries a failed read once, after a short delay, before showing the error.
    const listNoteComments = vi.fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ comments: [openHead], page: 1, hasNext: false });
    installApi({ listNoteComments });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /^Comments/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }, { timeout: 3000 }));
    expect(await screen.findByText('Should this be Q4?')).toBeInTheDocument();
  });

  it('loads more pages', async () => {
    const listNoteComments = vi.fn(async (_noteId: string, query: { page?: number }) => (
      query.page === 2
        ? { comments: [comment({ id: 'c-9', threadId: 't-9', body: 'Later thread' })], page: 2, hasNext: false }
        : { comments: [openHead], page: 1, hasNext: true }
    ));
    installApi({ listNoteComments });
    renderSection();
    await openSection();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Later thread')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});
