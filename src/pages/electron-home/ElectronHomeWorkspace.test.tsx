import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import type { DocumentPaneView } from './DocumentWorkspace';
import { ElectronHomeWorkspace, type ElectronHomeWorkspaceProps } from './ElectronHomeWorkspace';
import type { NotePane, OpenNoteTab, SavedOpenNoteTab } from './note-workspace';
import { reconcileLayout } from './pane-layout';
import { createOverlayWrapper } from './test-overlays';

vi.mock('./AppTopBar', () => {
  type Controls = {
    navigation: { onBack: () => void; onForward: () => void };
    navigatorCollapsed: boolean;
    onToggleNavigator: () => void;
  };
  const ApplicationControls = (props: Controls) => (
    <div data-testid="application-controls">
      <button type="button" onClick={props.onToggleNavigator}>toggle navigator</button>
      <button type="button" onClick={props.navigation.onBack}>back</button>
      <button type="button" onClick={props.navigation.onForward}>forward</button>
    </div>
  );
  return {
    useTrafficLightInset: () => true,
    ApplicationControls,
    // Only an open slot is visible to assistive technology; a closed one is inert and hidden.
    TitleBarLeadingSlot: (props: { open: boolean; children: ReactNode }) => (props.open ? <>{props.children}</> : null),
    CollapsedSidebarControls: (props: { navigation: Controls['navigation'] }) => (
      <div data-testid="collapsed-sidebar-controls">
        <button type="button" onClick={props.navigation.onBack}>back</button>
      </div>
    ),
    AppTopBar: (props: Controls) => (
      <header data-testid="app-topbar">
        <ApplicationControls {...props} />
      </header>
    ),
    PaneTabBar: (props: {
      segment: {
        paneId: string;
        isActivePane: boolean;
        tabs: OpenNoteTab[];
        activeTab: OpenNoteTab | null;
        onCloseOtherTabs: (tabId: string) => void;
        onCloseTab: (tabId: string) => void;
        onCloseTabsToRight: (tabId: string) => void;
        onSelectTab: (tabId: string) => void;
      };
      isSegmented: boolean;
      topRow: boolean;
      leading?: ReactNode;
      leadingOpen?: boolean;
    }) => (
      <div
        data-testid={`pane-tab-bar-${props.segment.paneId}`}
        data-active={String(props.segment.isActivePane)}
        data-segmented={String(props.isSegmented)}
        data-top-row={String(props.topRow)}
      >
        {props.leadingOpen ? props.leading : null}
        <span data-testid={`active-tab-${props.segment.paneId}`}>{props.segment.activeTab?.title ?? 'none'}</span>
        <span data-testid={`tab-count-${props.segment.paneId}`}>{props.segment.tabs.length}</span>
        <button type="button" onClick={() => props.segment.onSelectTab('tab-b')}>{`select tab ${props.segment.paneId}`}</button>
        <button type="button" onClick={() => props.segment.onCloseTab('tab-b')}>{`close tab ${props.segment.paneId}`}</button>
        <button type="button" onClick={() => props.segment.onCloseOtherTabs('tab-b')}>{`close others ${props.segment.paneId}`}</button>
        <button type="button" onClick={() => props.segment.onCloseTabsToRight('tab-b')}>{`close right ${props.segment.paneId}`}</button>
      </div>
    ),
  };
});

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
    value: number;
  }) => (
    <button
      type="button"
      data-testid={`resize-${props.label}`}
      data-disabled={String(Boolean(props.disabled))}
      onClick={() => props.onChange(props.value + 1)}
    >
      {props.label}
    </button>
  ),
}));

vi.mock('./DocumentWorkspace', () => ({
  DocumentWorkspace: (props: {
    activePaneId: string;
    panes: NotePane[];
    zoomedPaneId: string | null;
    renderPaneHeader?: (pane: NotePane, placement: { topRow: boolean; leading: boolean }) => ReactNode;
    emptyHeader?: ReactNode;
  }) => {
    const shown = props.zoomedPaneId ? props.panes.filter(pane => pane.paneId === props.zoomedPaneId) : props.panes;
    return (
      <section data-testid="document-workspace" data-active-pane={props.activePaneId}>
        {props.panes.length} panes
        {shown.length === 0 ? props.emptyHeader : shown.map((pane, index) => (
          <div key={pane.paneId}>{props.renderPaneHeader?.(pane, { topRow: true, leading: index === 0 })}</div>
        ))}
      </section>
    );
  },
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
      getPaneTabs: (pane) => pane.tabIds.flatMap((tabId) => tabs[tabId] ? [tabs[tabId]] : []),
      getPaneView: (pane) => createView(pane, pane.activeTabId ? tabs[pane.activeTabId] ?? null : null),
      getTabSyncState: () => 'saved',
      layout: {
        navigatorCollapsed: false,
      },
      state: {
        scopeKey: 'personal',
        activePaneId: 'pane-b',
        backStack: [{ paneId: 'pane-a', tabId: 'tab-a' }],
        forwardStack: [],
        panes,
        recentlyClosedTabs: [],
        zoomedPaneId: null,
      },
      actions: {
        moveActiveTabToOtherPane: noop,
        navigateBack: vi.fn(),
        navigateForward: vi.fn(),
        reorderTab: noop,
        reopenLastClosedTab: noop,
        requestCloseOtherTabs: vi.fn().mockResolvedValue(undefined),
        requestCloseTab: vi.fn().mockResolvedValue(undefined),
        requestCloseTabsToRight: vi.fn().mockResolvedValue(undefined),
        selectTab: vi.fn(),
        keepTab: vi.fn(),
        splitActiveTab: noop,
        splitActivePaneDown: noop,
        togglePaneZoom: noop,
        equalizePanes: noop,
        toggleNavigator: vi.fn(),
        onNewTab: vi.fn(),
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
      onFocusPane: noop,
      onCreateNote: noop,
      canCreateNote: true,
      onQuickOpen: noop,
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
  it('gives the sidebar its own title bar and each pane its own tab bar', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    expect(within(screen.getByTestId('app-topbar')).getByTestId('application-controls')).toBeInTheDocument();
    expect(screen.getByTestId('folder-navigator')).toHaveAttribute('id', 'note-navigator-panel');
    expect(screen.getByTestId('document-workspace')).toHaveAttribute('data-active-pane', 'pane-b');
    expect(screen.getByTestId('pane-tab-bar-pane-a')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('pane-tab-bar-pane-b')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('pane-tab-bar-pane-b')).toHaveAttribute('data-segmented', 'true');
    expect(screen.getByTestId('active-tab-pane-a')).toHaveTextContent('Features');
    expect(screen.getByTestId('active-tab-pane-b')).toHaveTextContent('Markdown Playground');
    expect(screen.getByTestId('tab-count-pane-b')).toHaveTextContent('2');
    // The sidebar holds the controls, so no pane repeats them.
    expect(screen.getAllByTestId('application-controls')).toHaveLength(1);
    expect(screen.queryByTestId('collapsed-sidebar-controls')).not.toBeInTheDocument();
  });

  it('keeps the sidebar toggle in place and leads the top-left pane with the history buttons while collapsed', () => {
    const props = createProps();
    props.titlebar.layout.navigatorCollapsed = true;

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    expect(within(screen.getByTestId('app-topbar')).getByTestId('application-controls')).toBeInTheDocument();
    expect(screen.getAllByTestId('application-controls')).toHaveLength(1);
    expect(within(screen.getByTestId('pane-tab-bar-pane-a')).getByTestId('collapsed-sidebar-controls')).toBeInTheDocument();
    expect(within(screen.getByTestId('pane-tab-bar-pane-b')).queryByTestId('collapsed-sidebar-controls')).not.toBeInTheDocument();
  });

  it('keeps the history buttons in reach above the empty state while the sidebar is collapsed', () => {
    const props = createProps();
    props.titlebar.layout.navigatorCollapsed = true;
    props.documentWorkspace = { ...props.documentWorkspace, panes: [] };

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    expect(within(screen.getByTestId('document-workspace')).getByTestId('collapsed-sidebar-controls')).toBeInTheDocument();
  });

  it('shows a single unsegmented tab bar when a pane is zoomed', () => {
    const props = createProps();
    props.titlebar.state.zoomedPaneId = 'pane-a';
    props.documentWorkspace = { ...props.documentWorkspace, zoomedPaneId: 'pane-a' };

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    expect(screen.getByTestId('pane-tab-bar-pane-a')).toHaveAttribute('data-segmented', 'false');
    expect(screen.queryByTestId('pane-tab-bar-pane-b')).not.toBeInTheDocument();
  });

  it('runs each tab bar\'s actions against its own pane', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'select tab pane-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'close others pane-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'close right pane-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'close tab pane-b' }));

    expect(props.titlebar.actions.selectTab).toHaveBeenCalledWith('pane-b', 'tab-b');
    expect(props.titlebar.actions.requestCloseOtherTabs).toHaveBeenCalledWith('pane-b', 'tab-b');
    expect(props.titlebar.actions.requestCloseTabsToRight).toHaveBeenCalledWith('pane-a', 'tab-b');
    expect(props.titlebar.actions.requestCloseTab).toHaveBeenCalledWith('tab-b');
  });

  it('passes navigator and titlebar shell callbacks without changing behavior', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />, { wrapper: createOverlayWrapper().wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'create note' }));
    fireEvent.click(screen.getByRole('button', { name: 'delete folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle navigator' }));
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    fireEvent.click(screen.getByRole('button', { name: 'forward' }));

    expect(props.navigator.actions.onCreate).toHaveBeenCalledTimes(1);
    expect(props.navigator.actions.onDeleteFolder).toHaveBeenCalledWith('folder-a');
    expect(props.titlebar.actions.toggleNavigator).toHaveBeenCalledTimes(1);
    expect(props.titlebar.actions.navigateBack).toHaveBeenCalledTimes(1);
    expect(props.titlebar.actions.navigateForward).toHaveBeenCalledTimes(1);
  });
});
