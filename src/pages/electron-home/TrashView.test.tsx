import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/toast';
import type { RestoreTrashResult, TrashedNoteSummary } from '@/lib/electron-api';

import { HACKMD_TEAM_TRASH_FORBIDDEN_MESSAGE } from '@/lib/note-errors';

import { TrashedNoteSummaryCard } from './NoteSummaryCard';
import { TrashNavigatorList } from './TrashView';
import type { WorkspaceScope } from './types';

const personalScope: WorkspaceScope = { type: 'personal', label: 'My Workspace' };
const teamScope: WorkspaceScope = { type: 'team', label: 'Demo', teamPath: 'demo-team' };

vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const roadmap: TrashedNoteSummary = {
  id: 'note-1', title: 'Roadmap', tags: [], deletedAtMillis: Date.UTC(2026, 9, 15, 10), permanentDeleteAtMillis: null,
};
const meeting: TrashedNoteSummary = {
  id: 'note-2', title: '', tags: [], deletedAtMillis: Date.UTC(2026, 9, 12, 12), permanentDeleteAtMillis: Date.UTC(2026, 10, 11, 12),
};

function installApi(overrides: Partial<NonNullable<typeof window.hackdeskAPI>['hackmd']> = {}) {
  const hackmd = {
    listTrash: vi.fn(async () => [roadmap, meeting]),
    restoreNotes: vi.fn(async (noteIds: string[]): Promise<RestoreTrashResult> => (
      Object.fromEntries(noteIds.map((noteId) => [noteId, { status: 'success' as const }]))
    )),
    getNote: vi.fn(async (noteId: string) => ({ source: 'remote' as const, data: { id: noteId, title: 'Roadmap', teamPath: null } })),
    ...overrides,
  };
  window.hackdeskAPI = { hackmd } as unknown as NonNullable<typeof window.hackdeskAPI>;
  return hackmd;
}

function renderTrash(scope: WorkspaceScope = personalScope) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const handlers = { onOpenChange: vi.fn(), onOpenNote: vi.fn() };
  render(
    <QueryClientProvider client={queryClient}>
      <TrashNavigatorList open scope={scope} {...handlers} />
    </QueryClientProvider>,
  );
  return { ...handlers, queryClient };
}

async function findRows() {
  const list = await screen.findByRole('list', { name: 'Deleted notes' });
  return within(list).getAllByRole('listitem');
}

describe('TrashNavigatorList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installApi();
  });
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('lists deleted notes with their dates', async () => {
    renderTrash();

    const rows = await findRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Roadmap');
    expect(rows[0].querySelector('time')).toHaveAttribute('dateTime', new Date(roadmap.deletedAtMillis!).toISOString());
    expect(rows[0]).not.toHaveTextContent('Kept until');
    expect(rows[1]).toHaveTextContent('Untitled');
    expect(rows[1].querySelector('time')).toHaveAttribute('dateTime', new Date(meeting.deletedAtMillis!).toISOString());
    expect(rows[1]).not.toHaveTextContent('Kept until');
  });

  it('gives the hover card the full title, the tags and both dates', () => {
    render(<TrashedNoteSummaryCard note={{ ...meeting, title: 'A long meeting title the row cuts short', tags: ['planning', 'q4'] }} />);
    expect(screen.getByText('A long meeting title the row cuts short')).toBeInTheDocument();
    expect(screen.getByText('planning')).toBeInTheDocument();
    expect(screen.getByText('q4')).toBeInTheDocument();
    expect(screen.getByText(/^Deleted Oct 12/)).toBeInTheDocument();
    expect(screen.getByText(/^Kept until Nov 11/)).toBeInTheDocument();
  });

  it('says when the trash is empty', async () => {
    installApi({ listTrash: vi.fn(async () => []) });
    renderTrash();

    expect(await screen.findByText('Trash is empty')).toBeInTheDocument();
  });

  it('loads team trash for the current workspace', async () => {
    const listTrash = vi.fn(async () => []);
    installApi({ listTrash });
    renderTrash(teamScope);

    await screen.findByText('Trash is empty');
    expect(listTrash).toHaveBeenCalledWith('demo-team');
  });

  it('shows a calm message when team trash is admin-only', async () => {
    installApi({
      listTrash: vi.fn(async () => {
        throw new Error(HACKMD_TEAM_TRASH_FORBIDDEN_MESSAGE);
      }),
    });
    renderTrash(teamScope);

    expect(await screen.findByText(HACKMD_TEAM_TRASH_FORBIDDEN_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('retries after a failed load', async () => {
    const listTrash = vi.fn()
      .mockRejectedValueOnce(new Error("Error invoking remote method 'hackmd:list-trash': Error: Offline"))
      .mockResolvedValueOnce([roadmap]);
    installApi({ listTrash });
    renderTrash();

    expect(await screen.findByText(/Could not load the trash\. Offline/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await findRows()).toHaveLength(1);
  });

  it('restores one note, drops it from the list and offers to open it', async () => {
    const hackmd = installApi();
    const { onOpenNote, onOpenChange } = renderTrash();

    fireEvent.click(within((await findRows())[0]).getByRole('button', { name: 'Restore Roadmap' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(hackmd.restoreNotes).toHaveBeenCalledWith(['note-1']);
    expect(toast.success).toHaveBeenCalledWith('Restored “Roadmap”.', expect.objectContaining({ action: expect.objectContaining({ label: 'Open' }) }));

    const [, options] = vi.mocked(toast.success).mock.calls[0];
    (options as { action: { onClick: () => void } }).action.onClick();
    await waitFor(() => expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' })));
    expect(hackmd.getNote).toHaveBeenCalledWith('note-1', null);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('multi-selects rows and restores them in a batch', async () => {
    const hackmd = installApi();
    renderTrash();
    const rows = await findRows();

    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Roadmap' }), { metaKey: true });
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Untitled' }), { metaKey: true });
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.queryByRole('listitem')).toBeNull());
    expect(hackmd.restoreNotes).toHaveBeenCalledWith(['note-1', 'note-2']);
    expect(toast.success).toHaveBeenCalledWith('Restored 2 notes.');
  });

  it('keeps notes HackMD could not restore, with the reason', async () => {
    const hackmd = installApi({
      restoreNotes: vi.fn(async () => ({
        'note-1': { status: 'success' as const },
        'note-2': { status: 'failure' as const, reason: 'NOT_FOUND' as const },
      })),
    });
    renderTrash();
    const rows = await findRows();

    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Roadmap' }), { metaKey: true });
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Untitled' }), { metaKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(hackmd.restoreNotes).toHaveBeenCalledWith(['note-1', 'note-2']);
    const remaining = screen.getByRole('listitem');
    expect(remaining).toHaveTextContent('Already removed or restored.');
    expect(toast.info).toHaveBeenCalledWith('Restored 1 of 2 notes.');
  });

  it('reports a failed request without changing the list', async () => {
    installApi({ restoreNotes: vi.fn(async () => { throw new Error('Unable to reach HackMD.'); }) });
    renderTrash();

    fireEvent.click(within((await findRows())[0]).getByRole('button', { name: 'Restore Roadmap' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Unable to reach HackMD.'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
