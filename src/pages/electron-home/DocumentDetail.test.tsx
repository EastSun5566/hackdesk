import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const markdownEditorFocus = vi.hoisted(() => vi.fn());
const markdownEditorReady = vi.hoisted(() => ({ current: true }));
const markdownEditorInsertText = vi.hoisted(() => vi.fn());
const markdownEditorOpenSearch = vi.hoisted(() => vi.fn());
const markdownEditorMounts = vi.hoisted(() => ({ nextId: 0 }));

vi.mock('@/components/MarkdownEditor', async () => {
  const React = await import('react');

  return {
    MarkdownEditor: React.forwardRef((props: {
      editorMode?: string;
      onAttachImage?: (file: File, placeholder: string) => Promise<unknown>;
      onChange: (value: string) => void;
      value: string;
    }, ref) => {
      const [mountId] = React.useState(() => ++markdownEditorMounts.nextId);
      const contentRef = React.useRef<HTMLTextAreaElement | null>(null);

      React.useImperativeHandle(ref, () => markdownEditorReady.current ? ({
        focus: markdownEditorFocus,
        getContentDOM: vi.fn(() => contentRef.current),
        getMarkdown: vi.fn(() => props.value),
        insertText: markdownEditorInsertText,
        openSearch: markdownEditorOpenSearch,
      }) : null);

      return (
        <>
          <textarea
            ref={contentRef}
            aria-label="Markdown editor"
            data-editor-mode={props.editorMode}
            data-mount-id={mountId}
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
              void props.onAttachImage?.(file, '![Uploading image fixture...]()');
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
      onReloadFromHackmd: vi.fn(),
      onOpenAsNewDraft: vi.fn(),
      onSave: vi.fn(),
      onSaveAsCopy: vi.fn(),
      onSaveMetadata: vi.fn(),
      onSaveSharing: vi.fn(),
      onShareOpenChange: vi.fn(),
      onTitleChange: vi.fn(),
      onToggleInspector: vi.fn(),
      onAttachImage: vi.fn(async () => undefined),
    },
    documentState: {
      content: document.content,
      document,
      isDraft: false,
      selectedNote: { title: document.title },
      syncState: 'idle',
      title: document.title,
    },
    editorKey: 'tab-1',
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

  const renderResult = render(
    <TooltipProvider>
      <DocumentDetail {...mergedProps} />
    </TooltipProvider>,
  );

  return {
    ...renderResult,
    props: mergedProps,
    rerenderDocumentDetail: (nextProps: DocumentDetailProps) => renderResult.rerender(
      <TooltipProvider>
        <DocumentDetail {...nextProps} />
      </TooltipProvider>,
    ),
  };
}

describe('DocumentDetail', () => {
  beforeEach(() => {
    markdownEditorReady.current = true;
    markdownEditorFocus.mockClear();
    markdownEditorInsertText.mockClear();
    markdownEditorOpenSearch.mockClear();
    markdownEditorMounts.nextId = 0;
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
    expect(screen.getByRole('heading', { name: 'No note selected' })).toBeInTheDocument();
  });

  it('passes the global editor mode to MarkdownEditor', () => {
    renderDocumentDetail({ editorMode: 'vim' });

    expect(screen.getByLabelText('Markdown editor')).toHaveAttribute('data-editor-mode', 'vim');
  });

  it('resets only the editor when its identity changes without replaying consumed commands', () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click');
    const { props, rerenderDocumentDetail } = renderDocumentDetail({
      layout: {
        attachImageRequestId: 1,
        searchRequestId: 1,
      },
    });
    const firstMountId = screen.getByLabelText('Markdown editor').getAttribute('data-mount-id');

    expect(markdownEditorOpenSearch).toHaveBeenCalledTimes(1);
    expect(inputClick).toHaveBeenCalledTimes(1);

    rerenderDocumentDetail({ ...props, editorKey: 'tab-2' });

    expect(screen.getByLabelText('Markdown editor')).not.toHaveAttribute('data-mount-id', firstMountId);
    expect(markdownEditorOpenSearch).toHaveBeenCalledTimes(1);
    expect(inputClick).toHaveBeenCalledTimes(1);
    inputClick.mockRestore();
  });

  it('waits for the editor ref and consumes focus, search and attachment requests once', () => {
    markdownEditorReady.current = false;
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    const onRequestHandled = vi.fn();
    const { props, rerenderDocumentDetail } = renderDocumentDetail({
      layout: { focusRequestId: 3, searchRequestId: 4, attachImageRequestId: 5, onRequestHandled },
    });
    expect(markdownEditorFocus).not.toHaveBeenCalled();
    expect(markdownEditorOpenSearch).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(onRequestHandled).not.toHaveBeenCalled();
    markdownEditorReady.current = true;
    rerenderDocumentDetail({ ...props });
    expect(markdownEditorFocus).toHaveBeenCalledTimes(1);
    expect(markdownEditorOpenSearch).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(onRequestHandled.mock.calls).toEqual([[3], [4], [5]]);
    rerenderDocumentDetail({ ...props });
    expect(onRequestHandled).toHaveBeenCalledTimes(3);
    click.mockRestore();
  });

  it('does not execute canceled commands when another editor becomes ready', () => {
    markdownEditorReady.current = false;
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    const { props, rerenderDocumentDetail } = renderDocumentDetail({
      layout: { focusRequestId: 3, searchRequestId: 4, attachImageRequestId: 5 },
    });
    markdownEditorReady.current = true;
    rerenderDocumentDetail({ ...props, editorKey: 'tab-2',
      layout: { ...props.layout, focusRequestId: 0, searchRequestId: 0, attachImageRequestId: 0 } });
    expect(markdownEditorFocus).not.toHaveBeenCalled();
    expect(markdownEditorOpenSearch).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
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

    expect(onSave).toHaveBeenCalledWith({
      content: 'Changed content',
      title: 'Changed title',
    });
  });

  it('renders an unsaved draft as an editable document without note-only actions', () => {
    const onSave = vi.fn();
    renderDocumentDetail({
      actions: { onSave },
      documentState: {
        content: 'Draft body',
        document: undefined,
        isDraft: true,
        selectedNote: { title: 'Untitled' },
        syncState: 'idle',
        title: 'Untitled',
      },
    });

    expect(screen.getByText('Unsaved draft')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'No note selected' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({
      content: 'Draft body',
      title: 'Untitled',
    });
    expect(screen.queryByRole('button', { name: 'Pane actions' })).not.toBeInTheDocument();
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

    cleanup();

    renderDocumentDetail({
      documentState: {
        content: 'Changed content',
        syncState: 'save_failed',
      },
    });

    expect(screen.getByRole('status', { name: 'Sync state: Save failed' })).toBeVisible();
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

  it('passes editor image attachments and their placeholder to the tab attach action', async () => {
    const onAttachImage = vi.fn(async () => undefined);
    renderDocumentDetail({
      actions: { onAttachImage },
      documentState: {
        document: documentSummary(),
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Paste image fixture' }));

    await waitFor(() => expect(onAttachImage).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'pasted.png' }),
      '![Uploading image fixture...]()',
    ));
  });

  it('attaches an image from the document file picker without saving the note', async () => {
    const onSave = vi.fn();
    const onAttachImage = vi.fn(async () => undefined);
    const document = documentSummary();
    renderDocumentDetail({
      actions: {
        onSave,
        onAttachImage,
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

    // The placeholder is inserted first, so the upload can finish in this tab after switching away.
    await waitFor(() => expect(onAttachImage).toHaveBeenCalledWith(file, expect.stringMatching(/^!\[Uploading image [0-9a-f]{8}\.\.\.\]\(\)$/)));
    expect(markdownEditorInsertText).toHaveBeenCalledWith(onAttachImage.mock.calls[0][1]);
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

  it('compares the draft and current disk content without invoking destructive recovery actions', async () => {
    const onReloadFromDisk = vi.fn();
    const onSaveAsCopy = vi.fn();
    renderDocumentDetail({
      actions: { onReloadFromDisk, onSaveAsCopy },
      documentState: {
        title: 'Draft title', content: 'Recovered edit',
        document: documentSummary({ title: 'Disk title', content: 'External edit', teamPath: LOCAL_VAULT_TEAM_PATH }),
        recovery: { kind: 'disk_changed', message: 'File changed on disk.' },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with disk' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compare with disk' });
    expect(within(dialog).getByRole('region', { name: 'Your draft' })).toHaveTextContent('Recovered edit');
    expect(within(dialog).getByRole('region', { name: 'On disk' })).toHaveTextContent('External edit');
    expect(onReloadFromDisk).not.toHaveBeenCalled();
    expect(onSaveAsCopy).not.toHaveBeenCalled();
  });

  it('offers HackMD change recovery without saving over the remote note', async () => {
    const onReloadFromHackmd = vi.fn();
    const onOpenAsNewDraft = vi.fn();
    const onSave = vi.fn();
    const document = documentSummary({ title: 'Remote title', content: 'Changed on HackMD' });
    renderDocumentDetail({
      actions: { onReloadFromHackmd, onOpenAsNewDraft, onSave },
      documentState: {
        title: 'Draft title', content: 'My edit', document,
        recovery: { kind: 'remote_changed', message: 'This note changed on HackMD.' },
      },
    });

    expect(screen.getByText('This note changed on HackMD. Your draft is still open.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save as copy' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with HackMD' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compare with HackMD' });
    expect(within(dialog).getByRole('region', { name: 'Your draft' })).toHaveTextContent('My edit');
    expect(within(dialog).getByRole('region', { name: 'On HackMD' })).toHaveTextContent('Changed on HackMD');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Open as new draft' }));
    expect(onOpenAsNewDraft).toHaveBeenCalledWith('Draft title', 'My edit');
    fireEvent.click(screen.getByRole('button', { name: 'Reload from HackMD' }));
    expect(onReloadFromHackmd).toHaveBeenCalledWith(document);
    expect(onSave).not.toHaveBeenCalled();
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

    expect(screen.queryByRole('button', { name: 'Expand note details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse note details' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Collapse note details' }));

    expect(screen.getByLabelText('Markdown editor')).toHaveValue('# Hello');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(onToggleInspector).toHaveBeenCalledOnce();
  });

  it('uses the document toolbar focus contract for editor actions', async () => {
    renderDocumentDetail();

    await expectToolbarRovingFocus('Document actions', [
      'Save',
      'Expand note details',
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
