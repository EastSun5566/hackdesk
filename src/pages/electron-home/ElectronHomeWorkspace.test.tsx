import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import type { DocumentPaneView } from './DocumentWorkspace';
import { ElectronHomeWorkspace, type ElectronHomeWorkspaceProps } from './ElectronHomeWorkspace';
import type { NotePane, OpenNoteTab, SavedOpenNoteTab } from './note-workspace';
import { reconcileLayout } from './pane-layout';
import { createOverlayWrapper } from './test-overlays';

vi.mock('./AppTopBar', () => ({
  AppTopBar: (props: {
    navigation: { onBack: () => void; onForward: () => void };
    paneLayout?: { paneCount: number; zoomed: boolean; onToggleZoom: () => void; onEqualize: () => void };
    onToggleNavigator: () => void;
  }) => (
    <header data-testid="app-topbar">
      <span data-testid="pane-count">{props.paneLayout?.paneCount ?? 0}</span>
      <button type="button" onClick={props.onToggleNavigator}>toggle navigator</button>
      <button type="button" onClick={props.navigation.onBack}>back</button>
      <button type="button" onClick={props.navigation.onForward}>forward</button>
      <button type="button" onClick={() => props.paneLayout?.onToggleZoom()}>zoom pane</button>
      <button type="button" onClick={() => props.paneLayout?.onEqualize()}>equalize panes</button>
    </header>
  ),
}));

vi.mock('./FolderNavigator', () => ({
  FolderNavigator: (props: {
    id: string;
    actions: {
      onCreate: () => void;
      onDeleteFolder: (folderId: string) => void;
    };
  }) => (
    <nav data-testid="folder-navigator" id={props.id}>
      <button type="button" onClick={props.actions.onCreate}>create note</button>
      <button type="button" onClick={() => props.actions.onDeleteFolder('folder-a')}>delete folder</button>
    </nav>
  ),
}));

vi.mock('./PanelResizeSash', () => ({
  PanelResizeSash: (props: {
    disabled?: boolean;
    label: string;
    onChange: (value: number) => void;
    onCollapse?: () => void;
    value: number;
  }) => (
    <button
      type="button"
      data-testid={`resize-${props.label}`}
      data-disabled={String(Boolean(props.disabled))}
      onClick={() => props.onChange(props.value + 1)}
      onDoubleClick={() => props.onCollapse?.()}
    >
      {props.label}
    </button>
  ),
}));

vi.mock('./DocumentWorkspace', () => ({
  DocumentWorkspace: (props: {
    activePaneId: string;
    panes: NotePane[];
    tabsWorkspace?: {
      onSelectTab: (paneId: string, tabId: string) => void;
      onCloseTab: (tabId: string) => void;
      onCloseOtherTabs: (paneId: string, tabId: string) => void;
      onCloseTabsToRight: (paneId: string, tabId: string) => void;
    };
  }) => (
    <section data-testid="document-workspace" data-active-pane={props.activePaneId}>
      {props.panes.length} panes
      <button type="button" onClick={() => props.tabsWorkspace?.onSelectTab('pane-b', 'tab-b')}>select tab</button>
      <button type="button" onClick={() => props.tabsWorkspace?.onCloseTab('tab-b')}>close tab</button>
      <button type="button" onClick={() => props.tabsWorkspace?.onCloseOtherTabs('pane-b', 'tab-b')}>close others</button>
      <button type="button" onClick={() => props.tabsWorkspace?.onCloseTabsToRight('pane-b', 'tab-b')}>close right</button>
    </section>
  ),
}));

function tab(overrides: Partial<SavedOpenNoteTab> = {}): SavedOpenNoteTab {
  return {
    tabId: 'tab-a',
    noteId: 'note-a',
    teamPath: null,
    title: 'Features',
    shortId: 'short-a',
    updatedAtMillis: 1,
    ...overrides,
  };
}

function user(): UserSummary {
  return {
    id: 'user-a',
    email: 'michael@example.com',
    name: 'Michael',
    username: 'michael',
    photo: null,
    upgraded: false,
    teams: [],
  };
}

function createView(pane: NotePane, activeTab: OpenNoteTab | null): DocumentPaneView {
  return {
    pane,
    activeTab,
    selectedNote: activeTab ? { title: activeTab.title } : null,
    document: undefined,
    title: activeTab?.title ?? '',
    content: '',
    isBlank: false,
    isDraft: false,
    isLoading: false,
    syncState: 'saved',
    isSaving: false,
    isSavingMetadata: false,
    isUploadingImage: false,
    isDeleting: false,
  };
}

function createProps(overrides: Partial<ElectronHomeWorkspaceProps> = {}): ElectronHomeWorkspaceProps {
  const tabs: Record<string, SavedOpenNoteTab> = {
    'tab-a': tab(),
    'tab-b': tab({ tabId: 'tab-b', noteId: 'note-b', title: 'Markdown Playground' }),
    'tab-c': tab({ tabId: 'tab-c', noteId: 'note-c', title: 'Inactive Pane' }),
  };
  const panes: NotePane[] = [
    { paneId: 'pane-a', tabIds: ['tab-a'], activeTabId: 'tab-a' },
    { paneId: 'pane-b', tabIds: ['tab-b', 'tab-c'], activeTabId: 'tab-b' },
  ];
  const tree = buildHackmdFolderTree([]);
  const noop = vi.fn();
  const props: ElectronHomeWorkspaceProps = {
    titlebar: {
      layout: {
        navigatorCollapsed: false,
      },
      state: {
        backStack: [{ paneId: 'pane-a', tabId: 'tab-a' }],
        forwardStack: [],
        panes,
        zoomedPaneId: null,
      },
      actions: {
        navigateBack: vi.fn(),
        navigateForward: vi.fn(),
        togglePaneZoom: vi.fn(),
        equalizePanes: vi.fn(),
        toggleNavigator: vi.fn(),
      },
    },
    workspaceNavigation: {
      platform: 'darwin',
      pinnedTeamIds: null,
      onPinnedTeamIdsChange: noop,
      scope: { type: 'personal', label: 'My Workspace' },
      user: user(),
      teams: [] as TeamSummary[],
      localVaults: [],
      onChooseLocalVault: noop,
      onSwitchLocalVault: noop,
      onScopeChange: noop,
      onOpenSettings: vi.fn(),
    },
    navigator: {
      scope: { type: 'personal', label: 'My Workspace' },
      tree,
      entries: [],
      finderState: DEFAULT_NOTE_FINDER_STATE,
      selection: {
        selectedFolderId: null,
        selectedNoteId: null,
      },
      layout: {
        collapsed: false,
        collapsedFolderIds: new Set(),
        width: 320,
      },
      emptyState: {
        title: 'No notes',
        description: 'Create a note.',
      },
      status: {
        activeError: null,
        canCreate: true,
        hasLocalVault: false,
        hasToken: true,
        isCreating: false,
        isFetching: false,
        isLoading: false,
        isMovingFolder: false,
        isMovingNote: false,
        showingCachedFallback: false,
      },
      actions: {
        onChooseLocalVault: noop,
        onFolderRevealInFinder: noop,
        onNoteRevealInFinder: noop,
        onCopyNoteLink: noop,
        onCopyNoteMarkdownLink: noop,
        onCreate: vi.fn(),
        onCreateFolder: noop,
        onCreateFolderInside: noop,
        onCreateNoteInside: noop,
        onDeleteFolder: vi.fn(),
        onDeleteNote: noop,
        onDuplicateNote: noop,
        onExportNoteMarkdown: noop,
        onFinderStateChange: noop,
        onFolderDrop: noop,
        onFolderSelect: noop,
        onFolderToggle: noop,
        onImportMarkdown: noop,
        onNoteMove: noop,
        onNoteSelect: noop,
        onOpenNote: noop,
        onOpenPalette: noop,
        onOpenSettings: noop,
        onRefresh: noop,
        onRevealNoteFolder: noop,
        onRenameFolder: noop,
      },
    },
    navigatorResize: {
      disabled: false,
      value: 320,
      onChange: vi.fn(),
    },
    documentWorkspace: {
      panes,
      layout: reconcileLayout(null, panes.map(candidate => candidate.paneId)),
      zoomedPaneId: null,
      activePaneId: 'pane-b',
      editorMode: 'standard',
      folderTree: tree,
      isInspectorCollapsed: false,
      getPaneView: (pane) => createView(pane, pane.activeTabId ? tabs[pane.activeTabId] ?? null : null),
      scopeKey: 'personal',
      editorRequests: [],
      onEditorRequestHandled: noop,
      onResizeSplit: noop,
      onEqualizeSplit: noop,
      onTogglePaneZoom: noop,
      onFocusPane: noop,
      onCreateNote: noop,
      canCreateNote: true,
      onQuickOpen: noop,
      tabsWorkspace: {
        getPaneTabs: (pane) => pane.tabIds.flatMap((tabId) => tabs[tabId] ? [tabs[tabId]] : []),
        getTabSyncState: () => 'saved',
        recentlyClosedCount: 0,
        onSelectTab: vi.fn(),
        onCloseTab: vi.fn(),
        onCloseOtherTabs: vi.fn(),
        onCloseTabsToRight: vi.fn(),
        onReorderTab: noop,
        onMoveTabToPane: noop,
        onSplitTabToNewPane: noop,
        onReopenLastClosedTab: noop,
        onKeepTab: noop,
        onSplitPane: noop,
        onMoveTabToOtherPane: noop,
        onClosePane: noop,
        onEqualizePanes: noop,
        onNewTab: noop,
      },
    },
    documentActions: {
      onOpenEditor: noop,
      onOpenExternal: noop,
      onCopyLink: noop,
      onCopyMarkdownLink: noop,
      onExportMarkdown: noop,
      onSave: noop,
      onSaveMetadata: noop,
      onSaveSharing: noop,
      onAttachImage: vi.fn().mockResolvedValue(undefined),
      onDelete: noop,
      onTitleChange: noop,
      onContentChange: noop,
      onToggleInspector: noop,
      onRevealInFinder: noop,
      onReloadFromDisk: noop,
      onReloadFromHackmd: noop,
      onSaveAsCopy: noop,
      onOpenAsNewDraft: noop,
      onCopyDraft: noop,
      onExportDraft: noop,
      onRetryLoad: noop,
    },
  };

  return {
    ...props,
    ...overrides,
  };
}

describe('ElectronHomeWorkspace', () => {
  it('renders the shell composition and forwards pane count to AppTopBar', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    expect(screen.getByTestId('app-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('folder-navigator')).toHaveAttribute('id', 'note-navigator-panel');
    expect(screen.getByTestId('document-workspace')).toHaveAttribute('data-active-pane', 'pane-b');
    expect(screen.getByTestId('pane-count')).toHaveTextContent('2');
  });

  it('passes workspace tab actions into DocumentWorkspace', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'select tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'close others' }));
    fireEvent.click(screen.getByRole('button', { name: 'close right' }));
    fireEvent.click(screen.getByRole('button', { name: 'close tab' }));

    expect(props.documentWorkspace.tabsWorkspace?.onSelectTab).toHaveBeenCalledWith('pane-b', 'tab-b');
    expect(props.documentWorkspace.tabsWorkspace?.onCloseOtherTabs).toHaveBeenCalledWith('pane-b', 'tab-b');
    expect(props.documentWorkspace.tabsWorkspace?.onCloseTabsToRight).toHaveBeenCalledWith('pane-b', 'tab-b');
    expect(props.documentWorkspace.tabsWorkspace?.onCloseTab).toHaveBeenCalledWith('tab-b');
  });

  it('passes navigator, titlebar, and collapse-sash shell callbacks without changing behavior', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'create note' }));
    fireEvent.click(screen.getByRole('button', { name: 'delete folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle navigator' }));
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    fireEvent.click(screen.getByRole('button', { name: 'forward' }));
    fireEvent.click(screen.getByRole('button', { name: 'zoom pane' }));
    fireEvent.click(screen.getByRole('button', { name: 'equalize panes' }));
    fireEvent.doubleClick(screen.getByTestId('resize-Resize sidebar'));

    expect(props.navigator.actions.onCreate).toHaveBeenCalledTimes(1);
    expect(props.navigator.actions.onDeleteFolder).toHaveBeenCalledWith('folder-a');
    expect(props.titlebar.actions.toggleNavigator).toHaveBeenCalledTimes(2);
    expect(props.titlebar.actions.navigateBack).toHaveBeenCalledTimes(1);
    expect(props.titlebar.actions.navigateForward).toHaveBeenCalledTimes(1);
    expect(props.titlebar.actions.togglePaneZoom).toHaveBeenCalledTimes(1);
    expect(props.titlebar.actions.equalizePanes).toHaveBeenCalledTimes(1);
  });
});
