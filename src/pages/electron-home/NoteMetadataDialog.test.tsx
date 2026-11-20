import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import { NoteMetadataDialog } from './NoteMetadataDialog';

function createDocument(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: '# Hello\n\nWord one two three',
    createdAtMillis: Date.UTC(2026, 9, 10),
    description: 'Old description',
    folderPaths: [],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'short-1',
    tags: ['old'],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Hello',
    titleUpdatedAtMillis: null,
    updatedAtMillis: Date.UTC(2026, 9, 12),
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

async function selectOption(label: string, optionName: string) {
  const trigger = screen.getByRole('combobox', { name: label });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

function renderNoteMetadataDialog({
  document = createDocument(),
  content = 'One two three four',
  isSaving = false,
  onOpenChange = vi.fn(),
  onSaveMetadata = vi.fn(),
  onOpenVersions = vi.fn(),
} = {}) {
  const folderTree = buildHackmdFolderTree([], [
    { clientId: null, color: null, icon: null, id: 'folder-a', name: 'Folder A', parentId: null },
  ]);

  const view = render(
    <NoteMetadataDialog
      open
      document={document}
      content={content}
      folderTree={folderTree}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      onSaveMetadata={onSaveMetadata}
      onOpenVersions={onOpenVersions}
    />,
  );

  return { ...view, document, onOpenChange, onSaveMetadata, onOpenVersions };
}

describe('NoteMetadataDialog', () => {
  it('saves updated tags, folder, and description without touching sharing fields', async () => {
    const onSaveMetadata = vi.fn();
    const { document } = renderNoteMetadataDialog({ onSaveMetadata });

    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove old tag' }));
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'design' } });
    fireEvent.keyDown(screen.getByLabelText('Tags'), { key: 'Enter' });
    await selectOption('Folder', 'Folder A');
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated summary' } });

    expect(screen.getByText('Unsaved changes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(onSaveMetadata).toHaveBeenCalledWith(document, {
      description: 'Updated summary',
      tags: ['design'],
      parentFolderId: 'folder-a',
    });
  });

  it('hides technical metadata under Advanced Info and jumps cleanly to Version History', () => {
    const onOpenChange = vi.fn();
    const onOpenVersions = vi.fn();
    renderNoteMetadataDialog({ onOpenChange, onOpenVersions });

    const toggle = screen.getByRole('button', { name: /Advanced Info/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('short-1 · edit')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('short-1 · edit')).toBeVisible();
    expect(screen.getByText(/4 words · 1 min read/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Open Version History' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenVersions).toHaveBeenCalledOnce();
  });

  it('shows saving state cleanly', () => {
    renderNoteMetadataDialog({ isSaving: true });

    const savingButton = screen.getByRole('button', { name: 'Saving…' });
    expect(savingButton).toBeDisabled();
    expect(savingButton.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
    expect(screen.getByText('Saving settings…')).toBeVisible();
  });
});
