import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { DocumentSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';
import {
  expectDisabledToolbarAction,
  expectMenuReturnsFocus,
  expectToolbarRovingFocus,
} from '@/test/accessibility-contracts';

import { DocumentDetail, type DocumentDetailProps } from './DocumentDetail';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { formatDate } from './ui';

const markdownEditorInsertText = vi.hoisted(() => vi.fn());

vi.mock('@/components/MarkdownEditor', async () => {
  const React = await import('react');

  return {
    MarkdownEditor: React.forwardRef((props: {
      editorMode?: string;
      onAttachImage?: (file: File) => Promise<{ link: string }>;
      onChange: (value: string) => void;
      value: string;
    }, ref) => {
      React.useImperativeHandle(ref, () => ({
        focus: vi.fn(),
        getContentDOM: vi.fn(() => null),
        getMarkdown: vi.fn(() => props.value),
        insertText: markdownEditorInsertText,
        openSearch: vi.fn(),
      }));

      return (
        <>
          <textarea
            aria-label="Markdown editor"
            data-editor-mode={props.editorMode}
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              const file = new File(['image-bytes'], 'pasted.png', { type: 'image/png' });
              Object.defineProperty(file, 'arrayBuffer', {
                value: async () => new ArrayBuffer(11),
              });
              void props.onAttachImage?.(file);
            }}
          >
            Paste image fixture
          </button>
        </>
      );
    }),
  };
});

function documentSummary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: '# Hello',
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
    title: 'Hello',
    titleUpdatedAtMillis: null,
    updatedAtMillis: 1_700_000_000_000,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

function renderDocumentDetail(overrides: Partial<DocumentDetailProps> = {}) {
  const document = documentSummary();
  const props: DocumentDetailProps = {
    actions: {
      onContentChange: vi.fn(),
      onCopyLink: vi.fn(),
      onCopyMarkdownLink: vi.fn(),
      onDelete: vi.fn(),
      onExportMarkdown: vi.fn(),
      onOpenEditor: vi.fn(),
      onOpenExternal: vi.fn(),
      onRevealInFinder: vi.fn(),
      onReloadFromDisk: vi.fn(),
      onSave: vi.fn(),
      onSaveAsCopy: vi.fn(),
      onSaveMetadata: vi.fn(),
      onSaveSharing: vi.fn(),
      onShareOpenChange: vi.fn(),
      onTitleChange: vi.fn(),
      onToggleInspector: vi.fn(),
      onUploadImage: vi.fn(),
    },
    documentState: {
      content: document.content,
      document,
      selectedNote: { title: document.title },
      syncState: 'idle',
      title: document.title,
    },
    editorMode: 'standard',
    folderTree: buildHackmdFolderTree([]),
    layout: {
      focusZone: 'editor',
      attachImageRequestId: 0,
      focusRequestId: 0,
      inspectorCollapsed: true,
      inspectorPanelId: 'inspector-test',
      searchRequestId: 0,
      shareOpen: false,
    },
    status: {
      deleting: false,
      loading: false,
      saving: false,
      savingMetadata: false,
      uploadingImage: false,
    },
  };
  const mergedProps: DocumentDetailProps = {
    ...props,
    ...overrides,
    actions: { ...props.actions, ...overrides.actions },
    documentState: { ...props.documentState, ...overrides.documentState },
    layout: { ...props.layout, ...overrides.layout },
    status: { ...props.status, ...overrides.status },
  };

  render(
    <TooltipProvider>
      <DocumentDetail {...mergedProps} />
    </TooltipProvider>,
  );

  return mergedProps;
}

describe('DocumentDetail', () => {
  beforeEach(() => {
    markdownEditorInsertText.mockClear();
  });

  it('renders loading and empty branches explicitly', () => {
    renderDocumentDetail({ status: { loading: true } });
    expect(screen.getByLabelText('Loading note')).toBeInTheDocument();

    renderDocumentDetail({
      documentState: {
        document: undefined,
        selectedNote: null,
      },
    });
    expect(screen.getByText('Select a note.')).toBeInTheDocument();
  });

  it('passes the global editor mode to MarkdownEditor', () => {
    renderDocumentDetail({ editorMode: 'vim' });

    expect(screen.getByLabelText('Markdown editor')).toHaveAttribute('data-editor-mode', 'vim');
  });

  it('saves dirty title and content through the structured actions', () => {
    const onSave = vi.fn();
    const document = documentSummary();
    renderDocumentDetail({
      actions: { onSave },
      documentState: {
        content: 'Changed content',
        document,
        title: 'Changed title',
      },
    });

    expect(screen.getByRole('status', { name: 'Sync state: Unsaved' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(document, {
      content: 'Changed content',
      title: 'Changed title',
    });
  });

  it('uses precise sync badge copy with polite status semantics and reduced-motion spinners', () => {
    renderDocumentDetail({
      documentState: { syncState: 'loading' },
    });

    const loadingBadge = screen.getByRole('status', { name: 'Sync state: Loading…' });
    expect(loadingBadge).toHaveAttribute('aria-live', 'polite');
    expect(loadingBadge).toHaveAttribute('aria-atomic', 'true');
    expect(loadingBadge.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');

    cleanup();

    renderDocumentDetail({
      documentState: {
        content: 'Changed content',
        syncState: 'saved',
      },
      status: { saving: true },
    });

    const savingBadge = screen.getByRole('status', { name: 'Sync state: Saving…' });
    expect(savingBadge.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
    expect(screen.getByRole('button', { name: 'Save' }).querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
  });

  it('does not auto-save local dirty documents', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    try {
      const document = documentSummary({
        teamPath: LOCAL_VAULT_TEAM_PATH,
      });
      renderDocumentDetail({
        actions: { onSave },
        documentState: {
          content: 'Changed content',
          document,
          title: 'Changed title',
        },
      });

      vi.advanceTimersByTime(1_000);

      expect(onSave).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends editor image attachments through the document upload action', async () => {
    const onUploadImage = vi.fn(async () => ({ link: 'attachments/pasted.png' }));
    const document = documentSummary();
    renderDocumentDetail({
      actions: { onUploadImage },
      documentState: {
        document,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Paste image fixture' }));

    await waitFor(() => expect(onUploadImage).toHaveBeenCalledTimes(1));
    expect(onUploadImage).toHaveBeenCalledWith(document, {
      bytes: expect.any(ArrayBuffer),
      fileName: 'pasted.png',
      mimeType: 'image/png',
    });
  });

  it('attaches an image from the document file picker without saving the note', async () => {
    const onSave = vi.fn();
    const onUploadImage = vi.fn(async () => ({ link: 'attachments/selected.png' }));
    const document = documentSummary();
    renderDocumentDetail({
      actions: {
        onSave,
        onUploadImage,
      },
      documentState: {
        document,
      },
      layout: {
        attachImageRequestId: 1,
      },
    });
    const file = new File(['image-bytes'], 'selected].png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new ArrayBuffer(11),
    });

    fireEvent.change(screen.getByLabelText('Attach image'), {
      target: {
        files: [file],
      },
    });

    await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith(document, {
      bytes: expect.any(ArrayBuffer),
      fileName: 'selected].png',
      mimeType: 'image/png',
    }));
    await waitFor(() => expect(markdownEditorInsertText).toHaveBeenCalledWith('![selected\\].png](attachments/selected.png)'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('offers disk change recovery actions without discarding the draft', () => {
    const onReloadFromDisk = vi.fn();
    const onSaveAsCopy = vi.fn();
    const document = documentSummary({
      content: 'Disk content',
      teamPath: LOCAL_VAULT_TEAM_PATH,
      title: 'Disk title',
    });
    renderDocumentDetail({
      actions: {
        onReloadFromDisk,
        onSaveAsCopy,
      },
      documentState: {
        content: 'Draft content',
        document,
        recovery: {
          kind: 'disk_changed',
          message: 'File changed on disk. Reload it or save a copy before writing.',
        },
        title: 'Draft title',
      },
    });

    expect(screen.getByText('File changed on disk. Your draft is still open.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reload from disk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as copy' }));

    expect(onReloadFromDisk).toHaveBeenCalledWith(document);
    expect(onSaveAsCopy).toHaveBeenCalledWith(document, {
      content: 'Draft content',
      title: 'Draft title',
    });
  });

  it('hides HackMD-only inspector controls for local documents', () => {
    renderDocumentDetail({
      documentState: {
        document: documentSummary({
          description: 'Projects/Note.md',
          teamPath: LOCAL_VAULT_TEAM_PATH,
        }),
      },
    });

    expect(screen.queryByRole('button', { name: 'Expand inspector' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse inspector' })).not.toBeInTheDocument();
    expect(screen.queryByText('Share…')).not.toBeInTheDocument();
  });

  it('keeps the remote header concise and leaves permissions to inspector surfaces', () => {
    renderDocumentDetail({
      documentState: {
        document: documentSummary({
          folderPaths: [{
            clientId: null,
            color: null,
            icon: null,
            id: 'folder-1',
            name: 'Projects',
            parentId: null,
          }],
          readPermission: 'owner',
          teamPath: 'team-a',
          writePermission: 'signed_in',
        }),
      },
    });

    expect(screen.getByText(formatDate(1_700_000_000_000))).toBeVisible();
    expect(screen.getByText('@team-a')).toBeVisible();
    expect(screen.getByText('Projects')).toBeVisible();
    expect(screen.queryByText('owner read')).not.toBeInTheDocument();
    expect(screen.queryByText('signed_in write')).not.toBeInTheDocument();
  });

  it('shows local path context without duplicating sync state in the subtitle', () => {
    renderDocumentDetail({
      documentState: {
        document: documentSummary({
          description: 'Projects/Note.md',
          teamPath: LOCAL_VAULT_TEAM_PATH,
        }),
        syncState: 'saved',
      },
    });

    expect(screen.getByText('Projects/Note.md')).toBeVisible();
    expect(screen.getByRole('status', { name: 'Sync state: Saved' })).toBeVisible();
    expect(screen.queryByText('Saved locally')).not.toBeInTheDocument();
  });

  it('keeps a single editor surface and inspector actions wired', () => {
    const onToggleInspector = vi.fn();
    renderDocumentDetail({
      actions: { onToggleInspector },
      layout: {
        inspectorCollapsed: false,
      },
    });

    expect(screen.getByRole('toolbar', { name: 'Document actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));

    expect(screen.getByLabelText('Markdown editor')).toHaveValue('# Hello');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(onToggleInspector).toHaveBeenCalledOnce();
  });

  it('uses the document toolbar focus contract for editor actions', async () => {
    renderDocumentDetail();

    await expectToolbarRovingFocus('Document actions', [
      'Save',
      'Expand inspector',
      'More actions',
    ]);
  });

  it('keeps clean-state save focusable without running save', async () => {
    const onSave = vi.fn();
    renderDocumentDetail({ actions: { onSave } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.mouseOver(saveButton);
    expectDisabledToolbarAction(saveButton, onSave);

    expect(await screen.findByText('No unsaved note changes.')).toBeVisible();
  });

  it('uses clear remote action menu copy and reduced-motion loading indicators', async () => {
    renderDocumentDetail({
      status: {
        deleting: true,
        uploadingImage: true,
      },
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions' }));

    const menu = await screen.findByRole('menu');
    expect(screen.getByText('Open in HackMD')).toBeVisible();
    expect(screen.getByText('Share…')).toBeVisible();
    expect(screen.getByText('Attach Image…')).toBeVisible();
    expect(screen.getByText('Copy HackMD Link')).toBeVisible();
    expect(screen.queryByText('HackMD')).not.toBeInTheDocument();
    expect(screen.queryByText('Share')).not.toBeInTheDocument();
    expect(menu.querySelectorAll('.animate-spin')).toHaveLength(2);
    for (const spinner of menu.querySelectorAll('.animate-spin')) {
      expect(spinner).toHaveClass('motion-reduce:animate-none');
    }
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps local action menu focused on file actions', async () => {
    renderDocumentDetail({
      documentState: {
        document: documentSummary({
          description: 'Projects/Note.md',
          teamPath: LOCAL_VAULT_TEAM_PATH,
        }),
      },
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions' }));

    await screen.findByRole('menu');
    expect(screen.getByText('Reveal in Finder')).toBeVisible();
    expect(screen.getByText('Move to Trash')).toBeVisible();
    expect(screen.queryByText('Open in HackMD')).not.toBeInTheDocument();
    expect(screen.queryByText('Share…')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy HackMD Link')).not.toBeInTheDocument();
  });

  it('returns focus to the document actions trigger when the menu closes', async () => {
    renderDocumentDetail();

    const trigger = screen.getByRole('button', { name: 'More actions' });
    await expectMenuReturnsFocus(trigger, (menu) => {
      fireEvent.keyDown(menu, { key: 'Escape' });
    });
  });
});
