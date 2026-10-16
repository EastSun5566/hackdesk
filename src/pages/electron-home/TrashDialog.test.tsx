import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/toast';
import type { RestoreTrashResult, TrashedNoteSummary } from '@/lib/electron-api';

import { TrashDialog } from './TrashDialog';

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

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const handlers = { onOpenChange: vi.fn(), onOpenNote: vi.fn() };
  render(
    <QueryClientProvider client={queryClient}>
      <TrashDialog open {...handlers} />
    </QueryClientProvider>,
  );
  return { ...handlers, queryClient };
}

async function findRows() {
  const list = await screen.findByRole('list', { name: 'Deleted notes' });
  return within(list).getAllByRole('listitem');
}

describe('TrashDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installApi();
  });
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('lists deleted notes with their dates', async () => {
    renderDialog();

    const rows = await findRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Roadmap');
    expect(rows[0]).toHaveTextContent(/Deleted Oct 15/);
    expect(rows[0]).not.toHaveTextContent('Kept until');
    expect(rows[1]).toHaveTextContent('Untitled');
    expect(rows[1]).toHaveTextContent(/Kept until Nov 11/);
    expect(screen.getByRole('button', { name: 'Restore Notes' })).toBeDisabled();
  });

  it('says when the trash is empty', async () => {
    installApi({ listTrash: vi.fn(async () => []) });
    renderDialog();

    expect(await screen.findByText('Your trash is empty.')).toBeInTheDocument();
  });

  it('retries after a failed load', async () => {
    const listTrash = vi.fn()
      .mockRejectedValueOnce(new Error("Error invoking remote method 'hackmd:list-trash': Error: Offline"))
      .mockResolvedValueOnce([roadmap]);
    installApi({ listTrash });
    renderDialog();

    expect(await screen.findByText(/Could not load the trash\. Offline/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await findRows()).toHaveLength(1);
  });

  it('restores one note, drops it from the list and offers to open it', async () => {
    const hackmd = installApi();
    const { onOpenNote, onOpenChange } = renderDialog();

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

  it('selects all, then shows a partial selection as mixed', async () => {
    renderDialog();
    await findRows();
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });

    fireEvent.click(selectAll);
    expect(screen.getByRole('checkbox', { name: 'Select Roadmap' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Untitled' })).toBeChecked();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore 2 Notes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Roadmap' }));
    expect(selectAll).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.getByRole('button', { name: 'Restore 1 Note' })).toBeEnabled();
  });

  it('keeps notes HackMD could not restore, with the reason', async () => {
    const hackmd = installApi({
      restoreNotes: vi.fn(async () => ({
        'note-1': { status: 'success' as const },
        'note-2': { status: 'failure' as const, reason: 'NOT_FOUND' as const },
      })),
    });
    renderDialog();
    await findRows();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore 2 Notes' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(hackmd.restoreNotes).toHaveBeenCalledWith(['note-1', 'note-2']);
    const remaining = screen.getByRole('listitem');
    expect(remaining).toHaveTextContent('Already removed or restored.');
    expect(within(remaining).getByRole('checkbox', { name: 'Select Untitled' })).toBeChecked();
    expect(within(remaining).getByRole('checkbox', { name: 'Select Untitled' })).toHaveAccessibleDescription('Already removed or restored.');
    expect(toast.info).toHaveBeenCalledWith('Restored 1 of 2 notes.');
  });

  it('reports a failed request without changing the list', async () => {
    installApi({ restoreNotes: vi.fn(async () => { throw new Error('Unable to reach HackMD.'); }) });
    renderDialog();

    fireEvent.click(within((await findRows())[0]).getByRole('button', { name: 'Restore Roadmap' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Unable to reach HackMD.'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
