import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateFolderDialog } from './CreateFolderDialog';
import { CreateNoteDialog } from './CreateNoteDialog';
import { RenameFolderDialog } from './RenameFolderDialog';

describe('create and edit dialogs', () => {
  it('keeps New Note concise and submits a trimmed title', () => {
    const onCreate = vi.fn();

    render(
      <CreateNoteDialog
        state={{ open: true, title: '  Draft note  ' }}
        scopeLabel="My Workspace"
        folderLabel="Projects"
        isCreating={false}
        onStateChange={vi.fn()}
        onCreate={onCreate}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'New Note' });
    expect(within(dialog).getByText('Location')).toBeVisible();
    expect(within(dialog).getByText('My Workspace / Projects')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(onCreate).toHaveBeenCalledWith('Draft note');
  });

  it('disables New Note actions while creating', () => {
    render(
      <CreateNoteDialog
        state={{ open: true, title: 'Draft note' }}
        scopeLabel="My Workspace"
        folderLabel={null}
        isCreating
        onStateChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'New Note' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    const createButton = within(dialog).getByRole('button', { name: 'Creating…' });
    expect(createButton).toBeDisabled();
    expect(createButton.querySelector('svg')).toHaveClass('motion-reduce:animate-none');
  });

  it('keeps New Folder payload semantics while reducing visible copy', () => {
    const onCreate = vi.fn();

    render(
      <CreateFolderDialog
        state={{
          open: true,
          name: '  Design  ',
          description: '  Design notes  ',
          icon: '  1F4C1  ',
          color: '  #2F80ED  ',
        }}
        scopeLabel="My Workspace"
        parentFolderLabel="Projects"
        isCreating={false}
        onStateChange={vi.fn()}
        onCreate={onCreate}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'New Folder' });
    expect(within(dialog).getByText('Location')).toBeVisible();
    expect(within(dialog).getByText('My Workspace / Projects')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(onCreate).toHaveBeenCalledWith({
      name: 'Design',
      description: 'Design notes',
      icon: '1F4C1',
      color: '#2F80ED',
    });
  });

  it('disables New Folder submit until a name exists and while creating', () => {
    const { rerender } = render(
      <CreateFolderDialog
        state={{ open: true, name: '   ', description: '', icon: '', color: '' }}
        scopeLabel="My Workspace"
        parentFolderLabel={null}
        isCreating={false}
        onStateChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

    rerender(
      <CreateFolderDialog
        state={{ open: true, name: 'Projects', description: '', icon: '', color: '' }}
        scopeLabel="My Workspace"
        parentFolderLabel={null}
        isCreating
        onStateChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'New Folder' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('keeps Edit Folder payload semantics and removes implementation copy', () => {
    const onRename = vi.fn();

    render(
      <RenameFolderDialog
        state={{
          open: true,
          folderId: 'folder-a',
          name: '  Projects  ',
          description: '   ',
          icon: '   ',
          color: '   ',
        }}
        isRenaming={false}
        onStateChange={vi.fn()}
        onRename={onRename}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit Folder' });
    expect(within(dialog).getByText('Update folder details and appearance.')).toBeVisible();
    expect(screen.queryByText(/in HackMD/i)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    expect(onRename).toHaveBeenCalledWith('folder-a', {
      name: 'Projects',
      description: null,
      icon: null,
      color: null,
    });
  });

  it('disables Edit Folder actions while saving', () => {
    render(
      <RenameFolderDialog
        state={{
          open: true,
          folderId: 'folder-a',
          name: 'Projects',
          description: '',
          icon: '',
          color: '',
        }}
        isRenaming
        onStateChange={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit Folder' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    const saveButton = within(dialog).getByRole('button', { name: 'Saving…' });
    expect(saveButton).toBeDisabled();
    expect(saveButton.querySelector('svg')).toHaveClass('motion-reduce:animate-none');
  });
});
