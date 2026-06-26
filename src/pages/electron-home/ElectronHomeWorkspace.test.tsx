import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import type { DocumentPaneView } from './DocumentWorkspace';
import { ElectronHomeWorkspace, type ElectronHomeWorkspaceProps } from './ElectronHomeWorkspace';
import type { NotePane, OpenNoteTab } from './note-workspace';

vi.mock('./AppTopBar', () => ({
  AppTopBar: (props: {
    activeTab: OpenNoteTab | null;
    navigation: { onBack: () => void; onForward: () => void };
    onCloseOtherTabs: (tabId: string) => void;
    onCloseTab: (tabId: string) => void;
    onCloseTabsToRight: (tabId: string) => void;
    onSelectTab: (tabId: string) => void;
    onToggleNavigator: () => void;
    onToggleRail: () => void;
    tabs: OpenNoteTab[];
  }) => (
    <header data-testid="app-topbar">
      <span data-testid="active-tab">{props.activeTab?.title ?? 'none'}</span>
      <span data-testid="tab-count">{props.tabs.length}</span>
      <button type="button" onClick={() => props.onSelectTab('tab-b')}>select tab</button>
      <button type="button" onClick={() => props.onCloseTab('tab-b')}>close tab</button>
      <button type="button" onClick={() => props.onCloseOtherTabs('tab-b')}>close others</button>
      <button type="button" onClick={() => props.onCloseTabsToRight('tab-b')}>close right</button>
      <button type="button" onClick={props.onToggleNavigator}>toggle navigator</button>
      <button type="button" onClick={props.onToggleRail}>toggle rail</button>
      <button type="button" onClick={props.navigation.onBack}>back</button>
      <button type="button" onClick={props.navigation.onForward}>forward</button>
    </header>
  ),
}));

vi.mock('./WorkspaceRail', () => ({
  WorkspaceRail: (props: {
    id: string;
    collapsed: boolean;
    onOpenSettings: () => void;
  }) => (
    <aside data-testid="workspace-rail" data-collapsed={String(props.collapsed)} id={props.id}>
      <button type="button" onClick={props.onOpenSettings}>open settings</button>
    </aside>
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
  }) => (
    <section data-testid="document-workspace" data-active-pane={props.activePaneId}>
      {props.panes.length} panes
    </section>
  ),
}));

function tab(overrides: Partial<OpenNoteTab> = {}): OpenNoteTab {
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
    isLoading: false,
    syncState: 'saved',
    isSaving: false,
    isSavingMetadata: false,
    isUploadingImage: false,
    isDeleting: false,
  };
}

function createProps(overrides: Partial<ElectronHomeWorkspaceProps> = {}): ElectronHomeWorkspaceProps {
  const tabs = {
    'tab-a': tab(),
    'tab-b': tab({ tabId: 'tab-b', noteId: 'note-b', title: 'Markdown Playground' }),
    'tab-c': tab({ tabId: 'tab-c', noteId: 'note-c', title: 'Inactive Pane' }),
  };
  const panes: NotePane[] = [
    { paneId: 'pane-a', tabIds: ['tab-a'], activeTabId: 'tab-a', size: 60 },
    { paneId: 'pane-b', tabIds: ['tab-b', 'tab-c'], activeTabId: 'tab-b', size: 40 },
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
        railCollapsed: false,
      },
      state: {
        activePaneId: 'pane-b',
        backStack: [{ paneId: 'pane-a', tabId: 'tab-a' }],
        forwardStack: [],
        panes,
        recentlyClosedTabs: [],
      },
      actions: {
        moveActiveTabToOtherPane: noop,
        navigateBack: vi.fn(),
        navigateForward: vi.fn(),
        reopenLastClosedTab: noop,
        requestCloseOtherTabs: vi.fn().mockResolvedValue(undefined),
        requestCloseTab: vi.fn().mockResolvedValue(undefined),
        requestCloseTabsToRight: vi.fn().mockResolvedValue(undefined),
        selectTab: vi.fn(),
        splitActiveTab: noop,
        toggleNavigator: vi.fn(),
        toggleRail: vi.fn(),
      },
    },
    rail: {
      scope: { type: 'personal', label: 'My Workspace' },
      user: user(),
      teams: [] as TeamSummary[],
      collapsed: false,
      width: 64,
      onScopeChange: noop,
      onOpenSettings: vi.fn(),
    },
    railResize: {
      disabled: false,
      value: 64,
      onChange: vi.fn(),
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
        hasToken: true,
        isCreating: false,
        isFetching: false,
        isLoading: false,
        isMovingFolder: false,
        isMovingNote: false,
        showingCachedFallback: false,
      },
      actions: {
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
        onToggleCollapsed: noop,
      },
    },
    navigatorResize: {
      disabled: false,
      value: 320,
      onChange: vi.fn(),
    },
    documentWorkspace: {
      panes,
      activePaneId: 'pane-b',
      folderTree: tree,
      shareOpen: false,
      isInspectorCollapsed: false,
      getPaneView: (pane) => createView(pane, pane.activeTabId ? tabs[pane.activeTabId] ?? null : null),
      editorSearchRequestId: 0,
      onResizePanes: noop,
      onFocusPane: noop,
      onOpenEditor: noop,
      onOpenExternal: noop,
      onCopyLink: noop,
      onCopyMarkdownLink: noop,
      onExportMarkdown: noop,
      onSave: noop,
      onSaveMetadata: noop,
      onSaveSharing: noop,
      onUploadImage: vi.fn().mockResolvedValue({ markdown: '![image](url)', url: 'url' }),
      onDelete: noop,
      onTitleChange: noop,
      onContentChange: noop,
      onToggleInspector: noop,
      onShareOpenChange: noop,
    },
  };

  return {
    ...props,
    ...overrides,
  };
}

describe('ElectronHomeWorkspace', () => {
  it('renders the shell composition and derives titlebar tabs from the active pane', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />);

    expect(screen.getByTestId('app-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-rail')).toHaveAttribute('id', 'workspace-rail-panel');
    expect(screen.getByTestId('folder-navigator')).toHaveAttribute('id', 'note-navigator-panel');
    expect(screen.getByTestId('document-workspace')).toHaveAttribute('data-active-pane', 'pane-b');
    expect(screen.getByTestId('active-tab')).toHaveTextContent('Markdown Playground');
    expect(screen.getByTestId('tab-count')).toHaveTextContent('2');
  });

  it('passes active-pane titlebar tab actions through with the active pane id', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'select tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'close others' }));
    fireEvent.click(screen.getByRole('button', { name: 'close right' }));
    fireEvent.click(screen.getByRole('button', { name: 'close tab' }));

    expect(props.titlebar.actions.selectTab).toHaveBeenCalledWith('pane-b', 'tab-b');
    expect(props.titlebar.actions.requestCloseOtherTabs).toHaveBeenCalledWith('pane-b', 'tab-b');
    expect(props.titlebar.actions.requestCloseTabsToRight).toHaveBeenCalledWith('pane-b', 'tab-b');
    expect(props.titlebar.actions.requestCloseTab).toHaveBeenCalledWith('tab-b');
  });

  it('passes navigator and titlebar shell callbacks without changing behavior', () => {
    const props = createProps();

    render(<ElectronHomeWorkspace {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'create note' }));
    fireEvent.click(screen.getByRole('button', { name: 'delete folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle navigator' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle rail' }));
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    fireEvent.click(screen.getByRole('button', { name: 'forward' }));

    expect(props.navigator.actions.onCreate).toHaveBeenCalledTimes(1);
    expect(props.navigator.actions.onDeleteFolder).toHaveBeenCalledWith('folder-a');
    expect(props.titlebar.actions.toggleNavigator).toHaveBeenCalledTimes(1);
    expect(props.titlebar.actions.toggleRail).toHaveBeenCalledTimes(1);
    expect(props.titlebar.actions.navigateBack).toHaveBeenCalledTimes(1);
    expect(props.titlebar.actions.navigateForward).toHaveBeenCalledTimes(1);
  });
});
