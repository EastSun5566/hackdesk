import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { DocumentSummary, UploadNoteImageResult } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import { NoteInspector } from './NoteInspector';

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
      onInsertMarkdown: vi.fn(),
      onSaveMetadata: vi.fn(),
      onUploadImage: vi.fn(async () => ({ link: 'https://assets.example/image.png' }) satisfies UploadNoteImageResult),
    },
    document,
    folderTree: buildHackmdFolderTree([], [
      { clientId: null, color: null, icon: null, id: 'folder-a', name: 'Folder A', parentId: null },
    ]),
    status: {
      saving: false,
      uploading: false,
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
    fireEvent.click(screen.getByRole('button', { name: 'Save Metadata' }));

    expect(onSaveMetadata).toHaveBeenCalledWith(document, {
      description: 'New description',
      tags: ['old', 'new'],
    });
  });

  it('keeps image upload and insert markdown behavior wired', async () => {
    const onInsertMarkdown = vi.fn();
    const onUploadImage = vi.fn(async () => ({ link: 'https://assets.example/image.png' }) satisfies UploadNoteImageResult);
    const { container, document } = renderNoteInspector({
      actions: {
        onInsertMarkdown,
        onUploadImage,
      },
    });
    const file = new File(['image-bytes'], 'diagram.png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn(async () => new ArrayBuffer(11)),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Images' }));
    fireEvent.change(screen.getByLabelText('Upload Image'), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument();
    });
    fireEvent.submit(container.querySelectorAll('form')[1] as HTMLFormElement);

    await waitFor(() => {
      expect(onUploadImage).toHaveBeenCalledWith(document, expect.objectContaining({
        fileName: 'diagram.png',
        mimeType: 'image/png',
      }));
    });
    expect(onInsertMarkdown).toHaveBeenCalledWith('\n![diagram](https://assets.example/image.png)\n');
  });
});
