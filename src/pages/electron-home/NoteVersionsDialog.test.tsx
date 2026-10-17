import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/toast';
import type { DocumentSummary, NoteVersionSummary } from '@/lib/electron-api';
import { HACKMD_NOTE_VERSION_NOT_NAMED_MESSAGE, HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE } from '@/lib/note-errors';

import { NoteVersionsDialog } from './NoteVersionsDialog';

vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const note = {
  id: 'note-1', title: 'Roadmap', content: 'Now', updatedAtMillis: Date.UTC(2026, 9, 15, 6), teamPath: null,
  lastChangeUser: { name: 'Michael', username: 'michael', photo: null, biography: null },
} as unknown as DocumentSummary;

function version(overrides: Partial<NoteVersionSummary>): NoteVersionSummary {
  return {
    id: 'v', name: '', nameSource: 'system', description: null, createdAtMillis: Date.UTC(2026, 9, 14), createdBy: null,
    contentAvailable: true, ...overrides,
  };
}

const named = version({ id: 'v-2', name: 'Before launch', nameSource: 'user', createdBy: { userId: 'u', displayName: 'Ada', photo: null } });
const automatic = version({ id: 'v-1' });

function installApi(overrides: Partial<NonNullable<typeof window.hackdeskAPI>['hackmd']> = {}, confirmed = true) {
  const hackmd = {
    listNoteVersions: vi.fn(async (_noteId: string, query: { page?: number; namedOnly?: boolean }) => (
      query.page === 2
        ? { versions: [version({ id: 'v-0', name: 'Kickoff', nameSource: 'user' })], page: 2, totalPages: 2, total: 3 }
        : { versions: query.namedOnly ? [named] : [named, automatic], page: 1, totalPages: query.namedOnly ? 1 : 2, total: 3 }
    )),
    getNoteVersion: vi.fn(async (_noteId: string, versionId: string) => ({ ...named, id: versionId, content: `content of ${versionId}` })),
    compareNoteVersions: vi.fn(async () => ({ unifiedDiff: '@@ -1 +1 @@\n-Old line\n+Now\n' })),
    ...overrides,
  };
  const confirm = vi.fn(async () => ({ confirmed }));
  window.hackdeskAPI = { hackmd, app: { confirm } } as unknown as NonNullable<typeof window.hackdeskAPI>;
  return { hackmd, confirm };
}

function renderDialog(props: Partial<Parameters<typeof NoteVersionsDialog>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const handlers = { onOpenChange: vi.fn(), onRestore: vi.fn(), onOpenAsNewDraft: vi.fn() };
  render(
    <QueryClientProvider client={queryClient}>
      <NoteVersionsDialog open document={note} noteDirty={false} {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('NoteVersionsDialog', () => {
  beforeEach(() => installApi());
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('lists Current first, then versions, and shows changes for the newest version', async () => {
    const { hackmd } = installApi();
    renderDialog();

    const list = await screen.findByRole('list', { name: 'Versions' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Current'),
      expect.stringContaining('Before launch'),
      expect.stringContaining('Auto-saved'),
    ]);
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(rows.map((row) => row.querySelector('[data-version-kind]')?.getAttribute('data-version-kind'))).toEqual(['current', 'named', 'auto']);
    expect(rows[1]).toHaveTextContent('Ada');

    const changes = await screen.findByRole('list', { name: 'Changes since Before launch' });
    expect(within(changes).getByText('Removed:')).toBeInTheDocument();
    expect(within(changes).getByText('Added:')).toBeInTheDocument();
    expect(hackmd.compareNoteVersions).toHaveBeenCalledWith('note-1', 'version:v-2', 'note_content');
  });

  it('filters to named versions and loads more pages until the last one', async () => {
    const { hackmd } = installApi();
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('button', { name: /Kickoff/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Named only' }));
    await waitFor(() => expect(hackmd.listNoteVersions).toHaveBeenCalledWith('note-1', { namedOnly: true, page: 1, limit: 20 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Auto-saved/ })).not.toBeInTheDocument());
  });

  it('describes the live note when Current is selected', async () => {
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: /^Current/ }));
    expect(screen.getByRole('heading', { name: 'Current version on HackMD' })).toBeInTheDocument();
    expect(screen.getByText(/by Michael/)).toBeInTheDocument();
  });

  it('disables Full text and restore when HackMD has no content for a version', async () => {
    installApi({
      listNoteVersions: vi.fn(async () => ({ versions: [version({ id: 'v-9', contentAvailable: false })], page: 1, totalPages: 1, total: 1 })),
    });
    renderDialog();

    expect(await screen.findByRole('tab', { name: 'Full text' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Restore into Editor' })).toBeDisabled();
  });

  it('restores a version into the editor', async () => {
    const { confirm } = installApi();
    const { onRestore, onOpenChange } = renderDialog();

    const restore = await screen.findByRole('button', { name: 'Restore into Editor' });
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(restore);

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('content of v-2'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before replacing unsaved edits', async () => {
    const { confirm } = installApi({}, false);
    const { onRestore } = renderDialog({ noteDirty: true });

    expect(await screen.findByText(/without your unsaved edits/)).toBeInTheDocument();
    const restore = screen.getByRole('button', { name: 'Restore into Editor' });
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(restore);

    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Replace', destructive: true })));
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('opens a version as a new draft', async () => {
    const { onOpenAsNewDraft } = renderDialog();

    const open = await screen.findByRole('button', { name: 'Open as New Draft' });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);

    expect(onOpenAsNewDraft).toHaveBeenCalledWith('Roadmap (Before launch)', 'content of v-2');
  });

  it('shows the full text of a version', async () => {
    renderDialog();

    fireEvent.click(await screen.findByRole('tab', { name: 'Full text' }));
    expect(await screen.findByText('content of v-2')).toBeInTheDocument();
  });

  it('saves the current content as a named version and selects it', async () => {
    const saved = version({ id: 'v-3', name: 'Launch', nameSource: 'user' });
    const { hackmd } = installApi({ createNoteVersion: vi.fn(async () => ({ status: 'created' as const, version: saved })) });
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Save Version…' }));
    const form = screen.getByRole('form', { name: 'Save version' });
    const submit = within(form).getByRole('button', { name: 'Save Version' });
    expect(submit).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: '  Launch  ' } });
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: 'Shipped' } });
    fireEvent.click(submit);

    await waitFor(() => expect(hackmd.createNoteVersion).toHaveBeenCalledWith('note-1', { name: 'Launch', description: 'Shipped' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Save version' })).not.toBeInTheDocument());
    // The list refetches after the save.
    await waitFor(() => expect(hackmd.listNoteVersions).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['no_content_change', /nothing new to save/],
    ['version_already_named', /already has a name/],
  ] as const)('explains a %s conflict and keeps the form open', async (status, message) => {
    installApi({ createNoteVersion: vi.fn(async () => ({ status, latestVersionId: 'v-2' })) });
    renderDialog({ noteDirty: true });

    fireEvent.click(await screen.findByRole('button', { name: 'Save Version…' }));
    const form = screen.getByRole('form', { name: 'Save version' });
    expect(within(form).getByText(/Unsaved edits are not included/)).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Again' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Version' }));

    expect(await within(form).findByRole('status')).toHaveTextContent(message);
  });

  it('edits a named version with its details filled in, and can clear the description', async () => {
    const withDescription = { ...named, description: 'Shipped' };
    const updated = { ...withDescription, name: 'Launch v2', description: null };
    const { hackmd } = installApi({
      listNoteVersions: vi.fn(async () => ({ versions: [withDescription, automatic], page: 1, totalPages: 1, total: 2 })),
      updateNoteVersion: vi.fn(async () => updated),
    });
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit…' }));
    const form = screen.getByRole('form', { name: 'Edit version' });
    expect(within(form).getByLabelText('Name')).toHaveValue('Before launch');
    expect(within(form).getByLabelText('Description')).toHaveValue('Shipped');
    expect(within(form).queryByText(/Unsaved edits are not included/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Version…' })).not.toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: ' Launch v2 ' } });
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: '' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(hackmd.updateNoteVersion).toHaveBeenCalledWith('note-1', 'v-2', { name: 'Launch v2', description: '' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit version' })).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('Updated version “Launch v2”.');
  });

  it('names an auto-saved version from that version', async () => {
    const { hackmd } = installApi({
      createNoteVersion: vi.fn(async () => ({ status: 'created' as const, version: { ...automatic, name: 'Draft A', nameSource: 'user' as const } })),
    });
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: /Auto-saved/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Name Version…' }));
    const form = screen.getByRole('form', { name: 'Name version' });
    expect(within(form).getByText(/Name the version auto-saved Oct 1[34]/)).toBeInTheDocument();
    expect(within(form).getByLabelText('Name')).toHaveValue('');
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Draft A' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Name Version' }));

    await waitFor(() => expect(hackmd.createNoteVersion).toHaveBeenCalledWith('note-1', { name: 'Draft A', base: 'version:v-1' }));
    expect(toast.success).toHaveBeenCalledWith('Named version “Draft A”.');
  });

  it('explains a version that was named or unnamed meanwhile', async () => {
    installApi({
      createNoteVersion: vi.fn(async () => ({ status: 'version_already_named' as const, latestVersionId: 'v-1' })),
      updateNoteVersion: vi.fn(async () => { throw new Error(HACKMD_NOTE_VERSION_NOT_NAMED_MESSAGE); }),
    });
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit…' }));
    let form = screen.getByRole('form', { name: 'Edit version' });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Changes' }));
    expect(await within(form).findByRole('status')).toHaveTextContent(HACKMD_NOTE_VERSION_NOT_NAMED_MESSAGE);
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: /Auto-saved/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Name Version…' }));
    form = screen.getByRole('form', { name: 'Name version' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Again' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Name Version' }));
    expect(await within(form).findByRole('status')).toHaveTextContent('This version already has a name.');
  });

  it('says when HackMD does not offer history for the note', async () => {
    installApi({ listNoteVersions: vi.fn(async () => { throw new Error(HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE); }) });
    renderDialog();

    expect(await screen.findByText(HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Version…' })).not.toBeInTheDocument();
  });
});
