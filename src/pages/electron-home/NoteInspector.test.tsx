import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { DocumentSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import { NoteInspector } from './NoteInspector';

async function selectOption(label: string, optionName: string | RegExp) {
  const trigger = screen.getByRole('combobox', { name: label });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

function documentSummary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: '# Hello',
    createdAtMillis: null,
    description: 'Old description',
    folderPaths: [],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-1',
    tags: ['old'],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Hello',
    titleUpdatedAtMillis: null,
    updatedAtMillis: null,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

function renderNoteInspector(overrides: Partial<Parameters<typeof NoteInspector>[0]> = {}) {
  const document = documentSummary();
  const props: Parameters<typeof NoteInspector>[0] = {
    actions: {
      onCopyLink: vi.fn(),
      onSaveMetadata: vi.fn(),
    },
    document,
    folderTree: buildHackmdFolderTree([], [
      { clientId: null, color: null, icon: null, id: 'folder-a', name: 'Folder A', parentId: null },
    ]),
    status: {
      saving: false,
    },
  };
  const mergedProps = {
    ...props,
    ...overrides,
    actions: { ...props.actions, ...overrides.actions },
    status: { ...props.status, ...overrides.status },
  };

  const view = render(
    <TooltipProvider>
      <NoteInspector {...mergedProps} />
    </TooltipProvider>,
  );

  return { ...view, ...mergedProps };
}

describe('NoteInspector', () => {
  it('saves metadata changes from split inspector sections', () => {
    const onSaveMetadata = vi.fn();
    const { document } = renderNoteInspector({ actions: { onSaveMetadata } });

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'New description' },
    });
    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'new' },
    });
    fireEvent.keyDown(screen.getByLabelText('Tags'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSaveMetadata).toHaveBeenCalledWith(document, {
      description: 'New description',
      tags: ['old', 'new'],
    });
  });

  it('saves location and permission changes from collapsed sections', async () => {
    const onSaveMetadata = vi.fn();
    const { document } = renderNoteInspector({ actions: { onSaveMetadata } });

    fireEvent.click(screen.getByRole('button', { name: 'Location' }));
    await selectOption('Folder', 'Folder A');
    fireEvent.click(screen.getByRole('button', { name: 'Permissions' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Read' })).getByRole('radio', { name: 'Guest' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Write' })).getByRole('radio', { name: 'Signed in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSaveMetadata).toHaveBeenCalledWith(document, {
      parentFolderId: 'folder-a',
      readPermission: 'guest',
      writePermission: 'signed_in',
    });
  });

  it('keeps independent section state and input values when collapsed', () => {
    renderNoteInspector();

    const metadataTrigger = screen.getByRole('button', { name: 'Metadata' });
    const permissionsTrigger = screen.getByRole('button', { name: 'Permissions' });
    const description = screen.getByLabelText('Description');

    expect(metadataTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(permissionsTrigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.change(description, { target: { value: 'Draft description' } });

    fireEvent.click(metadataTrigger);
    expect(metadataTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(description).not.toBeVisible();

    fireEvent.click(permissionsTrigger);
    expect(permissionsTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(metadataTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(metadataTrigger);
    expect(description).toBeVisible();
    expect(description).toHaveValue('Draft description');
  });

  it('copies the current note link from the inspector header', () => {
    const onCopyLink = vi.fn();
    const { document } = renderNoteInspector({ actions: { onCopyLink } });

    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }));

    expect(onCopyLink).toHaveBeenCalledWith(document);
  });

  it('shows metadata save state without hiding the primary action', () => {
    renderNoteInspector();

    const saveButton = screen.getByRole('button', { name: 'Save changes' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Updated description' },
    });

    expect(saveButton).toBeEnabled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('shows the saving state and disables metadata submission', () => {
    renderNoteInspector({
      document: documentSummary({ description: '' }),
      status: { saving: true },
    });

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Updated description' },
    });

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getAllByText('Saving…')).toHaveLength(2);
  });

  it('does not render the legacy image upload section', () => {
    renderNoteInspector();

    expect(screen.queryByRole('button', { name: 'Images' })).toBeNull();
    expect(screen.queryByLabelText('Upload Image')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Insert image' })).toBeNull();
  });
});
