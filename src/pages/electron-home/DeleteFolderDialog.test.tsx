import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FolderTreeNode } from '@/lib/hackmd-folders';

import { DeleteFolderDialog } from './DeleteFolderDialog';

function createFolder(overrides: Partial<FolderTreeNode> = {}): FolderTreeNode {
  return {
    children: [],
    color: null,
    folderPath: [],
    icon: null,
    id: 'folder-1',
    name: 'Projects',
    notes: [],
    parentId: null,
    ...overrides,
  };
}

function renderDeleteFolderDialog({
  folder = createFolder(),
  isDeleting = false,
  onCancel = vi.fn(),
  onDelete = vi.fn(),
}: {
  folder?: FolderTreeNode | null;
  isDeleting?: boolean;
  onCancel?: () => void;
  onDelete?: (folder: FolderTreeNode) => void;
} = {}) {
  render(
    <DeleteFolderDialog
      folder={folder}
      isDeleting={isDeleting}
      onCancel={onCancel}
      onDelete={onDelete}
    />,
  );

  return { folder, onCancel, onDelete };
}

describe('DeleteFolderDialog', () => {
  it('uses filled destructive styling and HackMD-specific copy for remote folders', () => {
    const { folder, onCancel, onDelete } = renderDeleteFolderDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Delete Folder' });
    expect(within(dialog).getByText(/deletes the folder from HackMD/i)).toBeVisible();
    expect(within(dialog).getByText(/Local vault files are not affected/i)).toBeVisible();

    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });
    expect(deleteButton).toHaveClass('bg-destructive-default');
    expect(deleteButton).toHaveClass('text-destructive-foreground');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith(folder);
  });

  it('uses system trash copy for local folders', () => {
    renderDeleteFolderDialog({
      folder: createFolder({ id: 'local-folder:Projects', name: 'Projects' }),
    });

    const dialog = screen.getByRole('alertdialog', { name: 'Move Folder to Trash' });
    expect(within(dialog).getByText(/Move “Projects” to the system trash/i)).toBeVisible();
    expect(within(dialog).getByText(/Local Markdown files inside the folder move with it/i)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Move to Trash' })).toBeVisible();
  });

  it('disables actions and respects reduced motion while deleting', () => {
    const { onCancel, onDelete } = renderDeleteFolderDialog({ isDeleting: true });
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Folder' });

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(dialog.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls cancel when dismissed with Escape', async () => {
    const onCancel = vi.fn();
    renderDeleteFolderDialog({ onCancel });

    fireEvent.keyDown(screen.getByRole('alertdialog', { name: 'Delete Folder' }), { key: 'Escape' });

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });
});
