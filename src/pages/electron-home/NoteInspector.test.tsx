import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { DocumentSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';
import { expectToolbarRovingFocus } from '@/test/accessibility-contracts';

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

type NoteInspectorProps = Parameters<typeof NoteInspector>[0];

type NoteInspectorPropsOverrides = Partial<Omit<NoteInspectorProps, 'actions'>> & {
  actions?: Partial<NoteInspectorProps['actions']>;
};

function renderNoteInspector(overrides: NoteInspectorPropsOverrides = {}) {
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

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NoteInspector {...mergedProps} />
      </TooltipProvider>
    </QueryClientProvider>,
  );

  return { ...view, ...mergedProps };
}

describe('NoteInspector versions', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('loads the latest versions only after the section is opened', async () => {
    const listNoteVersions = vi.fn(async () => ({
      versions: [{
        id: 'v-1', name: 'Before launch', nameSource: 'user' as const, description: null, createdAtMillis: Date.UTC(2026, 9, 14),
        createdBy: { userId: 'u', displayName: 'Ada', photo: null }, contentAvailable: true,
      }],
      page: 1,
      totalPages: 1,
      total: 1,
    }));
    window.hackdeskAPI = { hackmd: { listNoteVersions } } as unknown as NonNullable<typeof window.hackdeskAPI>;
    const onShowVersions = vi.fn();
    const onSaveMetadata = vi.fn();
    renderNoteInspector({ actions: { onShowVersions, onSaveMetadata } });

    expect(listNoteVersions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Versions/ }));

    expect(await screen.findByText('Before launch')).toBeInTheDocument();
    expect(listNoteVersions).toHaveBeenCalledWith('note-1', { limit: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'View all versions' }));
    expect(onShowVersions).toHaveBeenCalledOnce();
    expect(onSaveMetadata).not.toHaveBeenCalled();
  });

  it('offers comments only with a way to show them in the note', () => {
    const { unmount } = renderNoteInspector();
    expect(screen.queryByRole('button', { name: /^Comments/ })).not.toBeInTheDocument();
    unmount();

    renderNoteInspector({ actions: { onRevealComment: vi.fn(() => true) } });
    expect(screen.getByRole('button', { name: /^Comments/ })).toBeInTheDocument();
  });

  it('has no versions section without a way to show them', () => {
    renderNoteInspector();

    expect(screen.queryByRole('button', { name: /^Versions/ })).not.toBeInTheDocument();
  });
});

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
    expect(screen.getByRole('combobox', { name: 'Folder' })).toHaveTextContent('Root');
    await selectOption('Folder', 'Folder A');
    expect(screen.getByRole('combobox', { name: 'Folder' })).toHaveTextContent('Folder A');
    expect(screen.getByRole('combobox', { name: 'Folder' })).not.toHaveTextContent('folder-a');
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

    expect(screen.getByRole('toolbar', { name: 'Note details actions' })).toBeInTheDocument();
    expect(screen.queryByText(document.shortId)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }));

    expect(onCopyLink).toHaveBeenCalledWith(document);
  });

  it('uses a named toolbar for inspector header actions', async () => {
    renderNoteInspector();

    await expectToolbarRovingFocus('Note details actions', ['Copy Link']);
  });

  it('shows metadata save state without hiding the primary action', () => {
    const { container } = renderNoteInspector();

    const saveButton = screen.getByRole('button', { name: 'Save changes' });
    const scrollRegion = container.querySelector('[data-inspector-scroll-region="true"]');
    const saveFooter = container.querySelector('[data-inspector-save-footer="true"]');

    expect(scrollRegion).toBeInTheDocument();
    expect(saveFooter).toBeInTheDocument();
    expect(scrollRegion).not.toContainElement(saveButton);
    expect(saveFooter).toContainElement(saveButton);
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('Saved')).toBeInTheDocument();

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
    expect(screen.getByRole('button', { name: 'Saving…' }).querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
  });

  it('saves metadata after removing a tag', () => {
    const onSaveMetadata = vi.fn();
    const { document } = renderNoteInspector({ actions: { onSaveMetadata } });

    const removeTag = screen.getByRole('button', { name: 'Remove old tag' });

    fireEvent.click(removeTag);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSaveMetadata).toHaveBeenCalledWith(document, { tags: [] });
  });

  it('uses concise empty tag guidance', () => {
    renderNoteInspector({ document: documentSummary({ tags: [] }) });

    expect(screen.getByPlaceholderText('Add tag…')).toBeInTheDocument();
  });

  it('does not render the legacy image upload section', () => {
    renderNoteInspector();

    expect(screen.queryByRole('button', { name: 'Images' })).toBeNull();
    expect(screen.queryByLabelText('Upload Image')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Insert image' })).toBeNull();
  });
});
