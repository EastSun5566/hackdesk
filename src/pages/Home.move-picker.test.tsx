import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useHomeTestLifecycle,
  folder,
  renderHome,
  findRenderedNoteTitle,
  openCreateMenu,
  createApi,
} from './Home.test-utils';

vi.setConfig({ testTimeout: 15_000 });

// What the folder picker acts on (the folder being moved, or the New Note dialog's title while its
// location is chosen) is held while the picker is open, as the palette state's `target` (#385 P5).
// These pinned it while it was still a ref in Home, and keep pinning it there.
describe('Home folder picker payload', () => {
  useHomeTestLifecycle();

  const archive = { ...folder, id: 'folder-2', name: 'Archive' };

  it('moves the folder whose menu asked, to the folder picked', async () => {
    const api = createApi({
      hackmd: {
        ...createApi().hackmd,
        listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder, archive] })),
      },
    });
    renderHome(api);
    await findRenderedNoteTitle();

    fireEvent.contextMenu(await screen.findByRole('treeitem', { name: /^Projects/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Move to…/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Archive/ }));

    await waitFor(() => expect(api.hackmd.updateFolder).toHaveBeenCalledWith('folder-1', expect.objectContaining({ parentFolderId: 'folder-2' })));
  });

  async function openNewNoteWithTitle(title: string) {
    await openCreateMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^New Note⌘N$|^New Note$/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'New Note' }));
    fireEvent.change(dialog.getByLabelText('Title'), { target: { value: title } });
    return dialog;
  }

  const withFolders = () => createApi({
    hackmd: {
      ...createApi().hackmd,
      listFolders: vi.fn(async () => ({ source: 'remote' as const, data: [folder] })),
    },
  });

  it('brings the New Note dialog back with its title once a location is picked', async () => {
    renderHome(withFolders());
    await findRenderedNoteTitle();
    const dialog = await openNewNoteWithTitle('Weekly plan');

    fireEvent.click(dialog.getByRole('button', { name: /^Change location/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Projects/ }));

    const back = within(await screen.findByRole('dialog', { name: 'New Note' }));
    expect(back.getByLabelText('Title')).toHaveValue('Weekly plan');
    expect(back.getByRole('button', { name: /^Change location/ })).toHaveAccessibleName(/Projects$/);
  });

  it('brings the New Note dialog back with its title when the location picker is dismissed', async () => {
    renderHome(withFolders());
    await findRenderedNoteTitle();
    const dialog = await openNewNoteWithTitle('Weekly plan');

    fireEvent.click(dialog.getByRole('button', { name: /^Change location/ }));
    const picker = await screen.findByRole('dialog', { name: 'Choose Note Location' });
    await act(async () => { fireEvent.keyDown(picker, { key: 'Escape' }); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose Note Location' })).toBeNull());

    const back = within(await screen.findByRole('dialog', { name: 'New Note' }));
    expect(back.getByLabelText('Title')).toHaveValue('Weekly plan');
  });
});
