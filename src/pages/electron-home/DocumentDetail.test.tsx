import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { DocumentSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import { DocumentDetail, type DocumentDetailProps } from './DocumentDetail';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

vi.mock('@/components/MarkdownEditor', async () => {
  const React = await import('react');

  return {
    MarkdownEditor: React.forwardRef((props: { value: string; onChange: (value: string) => void }, ref) => {
      React.useImperativeHandle(ref, () => ({
        focus: vi.fn(),
        getContentDOM: vi.fn(() => null),
        getMarkdown: vi.fn(() => props.value),
        insertText: vi.fn(),
        openSearch: vi.fn(),
      }));

      return (
        <textarea
          aria-label="Markdown editor"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
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
      onSave: vi.fn(),
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
    folderTree: buildHackmdFolderTree([]),
    layout: {
      focusZone: 'editor',
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

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(document, {
      content: 'Changed content',
      title: 'Changed title',
    });
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

  it('keeps a single editor surface and inspector actions wired', () => {
    const onToggleInspector = vi.fn();
    renderDocumentDetail({
      actions: { onToggleInspector },
      layout: {
        inspectorCollapsed: false,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));

    expect(screen.getByLabelText('Markdown editor')).toHaveValue('# Hello');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(onToggleInspector).toHaveBeenCalledOnce();
  });
});
