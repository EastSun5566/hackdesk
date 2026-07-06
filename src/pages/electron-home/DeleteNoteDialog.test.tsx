import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';

import { DeleteNoteDialog } from './DeleteNoteDialog';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

function createNote(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: 'Body',
    createdAtMillis: null,
    description: '',
    folderPaths: [],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-1',
    tags: [],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Project Plan',
    titleUpdatedAtMillis: null,
    updatedAtMillis: null,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

function renderDeleteNoteDialog({
  note = createNote(),
  isDeleting = false,
  onCancel = vi.fn(),
  onDelete = vi.fn(),
}: {
  note?: DocumentSummary | null;
  isDeleting?: boolean;
  onCancel?: () => void;
  onDelete?: (note: DocumentSummary) => void;
} = {}) {
  render(
    <DeleteNoteDialog
      note={note}
      isDeleting={isDeleting}
      onCancel={onCancel}
      onDelete={onDelete}
    />,
  );

  return { note, onCancel, onDelete };
}

describe('DeleteNoteDialog', () => {
  it('uses filled destructive styling and HackMD-specific copy for remote notes', () => {
    const { note, onCancel, onDelete } = renderDeleteNoteDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Delete Note' });
    expect(within(dialog).getByText(/deletes the note from HackMD/i)).toBeVisible();
    expect(within(dialog).getByText(/Local vault Markdown files are not affected/i)).toBeVisible();

    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });
    expect(deleteButton).toHaveClass('bg-destructive-default');
    expect(deleteButton).toHaveClass('text-destructive-foreground');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith(note);
  });

  it('uses system trash copy for local notes', () => {
    renderDeleteNoteDialog({
      note: createNote({
        id: 'local-note:Projects/plan.md',
        publishLink: 'file:///Projects/plan.md',
        shortId: 'local-note-1',
        teamPath: LOCAL_VAULT_TEAM_PATH,
      }),
    });

    const dialog = screen.getByRole('alertdialog', { name: 'Move Note to Trash' });
    expect(within(dialog).getByText(/local Markdown file to the system trash/i)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Move to Trash' })).toBeVisible();
  });

  it('disables actions and respects reduced motion while deleting', () => {
    const { onCancel, onDelete } = renderDeleteNoteDialog({ isDeleting: true });
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Note' });

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
    renderDeleteNoteDialog({ onCancel });

    fireEvent.keyDown(screen.getByRole('alertdialog', { name: 'Delete Note' }), { key: 'Escape' });

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });
});
