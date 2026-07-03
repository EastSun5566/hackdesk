import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FolderTree } from '@/lib/hackmd-folders';

import { DocumentWorkspace, type DocumentPaneView } from './DocumentWorkspace';
import type { DocumentDetailProps } from './DocumentDetail';
import type { NotePane } from './note-workspace';

vi.mock('./DocumentDetail', () => ({
  DocumentDetail: ({ documentState, layout }: DocumentDetailProps) => (
    <article
      data-testid={`document-detail-${documentState.title}`}
      data-attach-request={layout.attachImageRequestId}
      data-focus-request={layout.focusRequestId}
      data-inspector-collapsed={String(layout.inspectorCollapsed)}
      data-search-request={layout.searchRequestId}
      data-share-open={String(layout.shareOpen)}
      tabIndex={0}
    />
  ),
}));

function pane(paneId: string, tabIds: string[], activeTabId = tabIds[0], size = 50): NotePane {
  return {
    activeTabId,
    paneId,
    size,
    tabIds,
  };
}

function createView(candidate: NotePane): DocumentPaneView {
  const tabId = candidate.activeTabId ?? candidate.tabIds[0] ?? candidate.paneId;

  return {
    activeTab: {
      noteId: `${tabId}-note`,
      shortId: `${tabId}-short`,
      tabId,
      teamPath: null,
      title: candidate.paneId === 'pane-a' ? 'Left note' : 'Right note',
      updatedAtMillis: null,
    },
    content: '',
    isDeleting: false,
    isLoading: false,
    isSaving: false,
    isSavingMetadata: false,
    isUploadingImage: false,
    pane: candidate,
    selectedNote: { title: candidate.paneId === 'pane-a' ? 'Left note' : 'Right note' },
    syncState: 'saved',
    title: candidate.paneId === 'pane-a' ? 'Left note' : 'Right note',
  };
}

function renderWorkspace(overrides: Partial<Parameters<typeof DocumentWorkspace>[0]> = {}) {
  const panes = [
    pane('pane-a', ['tab-a'], 'tab-a', 48),
    pane('pane-b', ['tab-b'], 'tab-b', 52),
  ];
  const props: Parameters<typeof DocumentWorkspace>[0] = {
    activePaneId: 'pane-b',
    attachImageRequestId: 7,
    editorFocusRequestId: 9,
    editorMode: 'standard',
    editorSearchRequestId: 11,
    folderTree: { root: { children: [], id: 'root', name: 'Root', path: '', type: 'folder' } } as FolderTree,
    getPaneView: vi.fn(createView),
    isInspectorCollapsed: false,
    onContentChange: vi.fn(),
    onCopyLink: vi.fn(),
    onCopyMarkdownLink: vi.fn(),
    onDelete: vi.fn(),
    onExportMarkdown: vi.fn(),
    onFocusPane: vi.fn(),
    onOpenEditor: vi.fn(),
    onOpenExternal: vi.fn(),
    onReloadFromDisk: vi.fn(),
    onResizePanes: vi.fn(),
    onRevealInFinder: vi.fn(),
    onSave: vi.fn(),
    onSaveAsCopy: vi.fn(),
    onSaveMetadata: vi.fn(),
    onSaveSharing: vi.fn(),
    onShareOpenChange: vi.fn(),
    onTitleChange: vi.fn(),
    onToggleInspector: vi.fn(),
    onUploadImage: vi.fn(),
    panes,
    shareOpen: true,
    ...overrides,
  };

  render(<DocumentWorkspace {...props} />);

  return props;
}

describe('DocumentWorkspace', () => {
  it('marks the active split pane with semantic and visual state', () => {
    renderWorkspace();

    const inactivePane = screen.getByRole('region', { name: 'Document pane 1' });
    const activePane = screen.getByRole('region', { name: 'Active document pane 2' });

    expect(inactivePane).toHaveAttribute('data-active-pane', 'false');
    expect(inactivePane).not.toHaveAttribute('aria-current');
    expect(activePane).toHaveAttribute('data-active-pane', 'true');
    expect(activePane).toHaveAttribute('aria-current', 'true');
    expect(activePane).toHaveClass('before:bg-primary-default');
  });

  it('only routes active-pane requests to the active document detail', () => {
    renderWorkspace();

    const inactiveDetail = screen.getByTestId('document-detail-Left note');
    const activeDetail = screen.getByTestId('document-detail-Right note');

    expect(inactiveDetail).toHaveAttribute('data-focus-request', '0');
    expect(inactiveDetail).toHaveAttribute('data-search-request', '0');
    expect(inactiveDetail).toHaveAttribute('data-attach-request', '0');
    expect(inactiveDetail).toHaveAttribute('data-share-open', 'false');
    expect(inactiveDetail).toHaveAttribute('data-inspector-collapsed', 'true');

    expect(activeDetail).toHaveAttribute('data-focus-request', '9');
    expect(activeDetail).toHaveAttribute('data-search-request', '11');
    expect(activeDetail).toHaveAttribute('data-attach-request', '7');
    expect(activeDetail).toHaveAttribute('data-share-open', 'true');
    expect(activeDetail).toHaveAttribute('data-inspector-collapsed', 'false');
  });

  it('keeps pane focus wiring unchanged', () => {
    const props = renderWorkspace();

    fireEvent.focus(screen.getByTestId('document-detail-Left note'));
    fireEvent.focus(screen.getByTestId('document-detail-Right note'));

    expect(props.onFocusPane).toHaveBeenCalledWith('pane-a');
    expect(props.onFocusPane).toHaveBeenCalledWith('pane-b');
  });

  it('labels the split pane resize separator', () => {
    renderWorkspace();

    const separator = screen.getByLabelText('Resize document panes between pane 1 and pane 2');

    expect(separator).toHaveAttribute('id', 'document-pane-separator-pane-b');
    expect(separator).toHaveClass('focus-visible:before:bg-primary-default');
  });
});
