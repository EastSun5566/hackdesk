import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTheme } from '@/components/theme-provider';
import { getDesktopAPI } from '@/lib/desktop-api';
import type { FolderSummary, NoteSummary } from '@/lib/electron-api';
import {
  readRecentNotes,
  removeRecentNote,
  upsertRecentNote,
  writeRecentNotes,
  type ElectronRecentNote,
} from '@/lib/electron-recent-notes';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import { AppTopBar } from './electron-home/AppTopBar';
import { CommandPaletteDialog } from './electron-home/CommandPaletteDialog';
import { DocumentWorkspace } from './electron-home/DocumentWorkspace';
import { ElectronHomeDialogs } from './electron-home/ElectronHomeDialogs';
import { FolderNavigator } from './electron-home/FolderNavigator';
import { PanelResizeSash } from './electron-home/PanelResizeSash';
import { WorkspaceRail } from './electron-home/WorkspaceRail';
import { getScopeStorageKey } from './electron-home/repository';
import type { NoteIdentity } from './electron-home/note-workspace';
import type { WorkspaceScope } from './electron-home/types';
import {
  FOLDER_COLLAPSED_PREFIX,
  NAVIGATOR_WIDTH_DEFAULT,
  NAVIGATOR_WIDTH_MAX,
  NAVIGATOR_WIDTH_MIN,
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
  writeStringArrayStorage,
} from './electron-home/ui-preferences';
import { useElectronHackmdQueries } from './electron-home/useElectronHackmdQueries';
import { useElectronFocusZones } from './electron-home/useElectronFocusZones';
import { useElectronNoteMutations } from './electron-home/useElectronNoteMutations';
import { useDocumentCommands } from './electron-home/useDocumentCommands';
import { useNoteWorkspaceTabs } from './electron-home/useNoteWorkspaceTabs';
import {
  createClosedFolderDialogState,
  createClosedRenameFolderDialogState,
  useWorkbenchDialogState,
} from './electron-home/useWorkbenchDialogState';
import {
  useWorkbenchActions,
} from './electron-home/useWorkbenchActions';
import { useWorkbenchActionHandlers } from './electron-home/useWorkbenchActionHandlers';
import { useWorkbenchAutoSelection } from './electron-home/useWorkbenchAutoSelection';
import { useWorkbenchClosePolicy } from './electron-home/useWorkbenchClosePolicy';
import { useWorkbenchDocuments } from './electron-home/useWorkbenchDocuments';
import { useElectronHomeStatus } from './electron-home/useElectronHomeStatus';
import { useWorkbenchFinder } from './electron-home/useWorkbenchFinder';
import { useWorkbenchNavigator } from './electron-home/useWorkbenchNavigator';
import { usePendingRecentNoteRestore } from './electron-home/usePendingRecentNoteRestore';
import { useWorkbenchQuickOpen } from './electron-home/useWorkbenchQuickOpen';
import { useWorkbenchPanelState } from './electron-home/useWorkbenchPanelState';
import { useWorkbenchShortcuts } from './electron-home/useWorkbenchShortcuts';
import { useWorkbenchTabLifecycle } from './electron-home/useWorkbenchTabLifecycle';
import {
  getInitialWorkspaceScope,
  useWorkbenchWorkspaceState,
} from './electron-home/useWorkbenchWorkspaceState';

const WORKSPACE_RAIL_PANEL_ID = 'workspace-rail-panel';
const NOTE_NAVIGATOR_PANEL_ID = 'note-navigator-panel';

export function Home() {
  const { resolvedMode, setTheme } = useTheme();
  const api = getDesktopAPI();
  const initialWorkspaceScope = useMemo(() => getInitialWorkspaceScope(), []);
  const [recentNotes, setRecentNotes] = useState<ElectronRecentNote[]>(() => readRecentNotes(window.localStorage));
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const autoSelectSuppressionRef = useRef<string | null>(null);
  const manualEmptyWorkspaceRef = useRef(false);
  const panelState = useWorkbenchPanelState();
  const dialogState = useWorkbenchDialogState();
  const {
    closeTransientLayer,
    createDialog,
    createFolderDialog,
    deleteFolderTarget,
    deleteTarget,
    palette,
    renameFolderDialog,
    settingsOpen,
    shareOpen,
    setCreateDialog,
    setCreateFolderDialog,
    setDeleteFolderTarget,
    setDeleteTarget,
    setPalette,
    setRenameFolderDialog,
    setSettingsOpen,
    setShareOpen,
  } = dialogState;
  const workspaceState = useWorkbenchWorkspaceState({
    initialWorkspaceScope,
    manualEmptyWorkspaceRef,
  });
  const {
    collapsedFolderIds,
    scope,
    scopeStorageKey,
    selectedFolderId,
    setCollapsedFolderIds,
    setSelectedFolderId,
    setWorkspaceScope: setWorkspaceScopeState,
  } = workspaceState;
  const {
    editorSearchRequestId,
    inspectorCollapsed,
    navigatorCollapsed,
    navigatorWidth,
    railCollapsed,
    railWidth,
    bumpEditorSearchRequest,
    expandNavigator,
    setNavigatorCollapsed,
    setNavigatorWidth,
    setRailWidth,
    toggleInspectorCollapsed,
    toggleNavigatorCollapsed,
    toggleRailCollapsed,
  } = panelState;
  const noteWorkspace = useNoteWorkspaceTabs(scopeStorageKey);
  const {
    activeFinderState,
    deferredFinderState,
    finderActive,
    focusWorkspaceSearch,
    loadFinderStateForScope,
    setFinderState,
  } = useWorkbenchFinder({
    initialScopeStorageKey: workspaceState.initialScopeStorageKey,
    scopeStorageKey,
    selectedFolderId,
    setNavigatorCollapsed,
  });
  const setWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    const nextScopeStorageKey = getScopeStorageKey(nextScope);
    setWorkspaceScopeState(nextScope);
    loadFinderStateForScope(nextScopeStorageKey);
  }, [loadFinderStateForScope, setWorkspaceScopeState]);
  const { focusZone } = useElectronFocusZones();
  const selectedNote = useMemo<NoteIdentity | null>(() => (
    noteWorkspace.activeTab
      ? { id: noteWorkspace.activeTab.noteId, teamPath: noteWorkspace.activeTab.teamPath }
      : null
  ), [noteWorkspace.activeTab]);
  const openNoteInWorkspace = noteWorkspace.openNote;

  const {
    settings,
    hasToken,
    user,
    teams,
    currentNotes,
    currentFolders,
    currentFolderOrder,
    documentsByKey,
    documentQueries,
    queries,
  } = useElectronHackmdQueries({
    api,
    scope,
    selectedNote,
    activeDocumentNotes: noteWorkspace.visibleActiveTabs.map((tab) => ({
      id: tab.noteId,
      teamPath: tab.teamPath,
    })),
  });

  useEffect(() => {
    if (settings?.shouldShowHackmdOnboarding && !settingsOpen) {
      setOnboardingOpen(true);
    }
  }, [settings?.shouldShowHackmdOnboarding, settingsOpen]);

  const displayScope = useMemo<WorkspaceScope>(() => {
    if (scope.type !== 'team') {
      return scope;
    }

    const team = teams.find((candidate) => candidate.path === scope.teamPath);
    return team && team.name !== scope.label
      ? { type: 'team', label: team.name, teamPath: team.path }
      : scope;
  }, [scope, teams]);

  const folderTree = useMemo(
    () => buildHackmdFolderTree(currentNotes, currentFolders, currentFolderOrder),
    [currentFolderOrder, currentFolders, currentNotes],
  );
  const syncOpenNoteSummaries = noteWorkspace.syncNoteSummaries;
  useEffect(() => {
    syncOpenNoteSummaries(currentNotes);
  }, [currentNotes, syncOpenNoteSummaries]);
  const selectedParentFolderIdForMutation = selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID ? selectedFolderId : undefined;
  const activeTab = noteWorkspace.activeTab;

  const updateRecentNotes = useCallback((updater: (current: ElectronRecentNote[]) => ElectronRecentNote[]) => {
    setRecentNotes((current) => {
      const next = updater(current);
      writeRecentNotes(window.localStorage, next);
      return next;
    });
  }, []);

  const trackRecentNote = useCallback((note: NoteSummary) => {
    updateRecentNotes((current) => upsertRecentNote(current, note));
  }, [updateRecentNotes]);

  const openHackmdTokenSetup = useCallback(() => {
    setOnboardingOpen(true);
  }, []);

  const removeRecentNoteEntry = useCallback((noteId: string, teamPath: string | null) => {
    updateRecentNotes((current) => removeRecentNote(current, noteId, teamPath));
  }, [updateRecentNotes]);

  const requestSelectNote = useCallback(async (
    note: NoteSummary,
    options: { focusEditor?: boolean; trackRecent?: boolean } = {},
  ) => {
    autoSelectSuppressionRef.current = null;
    manualEmptyWorkspaceRef.current = false;
    openNoteInWorkspace(note);
    if (options.trackRecent ?? true) {
      trackRecentNote(note);
    }

    if (options.focusEditor) {
      window.requestAnimationFrame(() => focusZone('editor'));
    }

    return true;
  }, [focusZone, openNoteInWorkspace, trackRecentNote]);

  const handleNoteSelect = useCallback((note: NoteSummary) => {
    void requestSelectNote(note, { trackRecent: true });
  }, [requestSelectNote]);

  const mutations = useElectronNoteMutations({
    api,
    scope,
    selectedNote,
    selectedParentFolderId: selectedParentFolderIdForMutation,
    onSettingsSaved: () => setSettingsOpen(false),
    onNoteCreated: (note) => {
      setCreateDialog({ open: false, title: '' });
      void requestSelectNote(note, { trackRecent: true });
    },
    onFolderCreated: (folder: FolderSummary) => {
      setCreateFolderDialog(createClosedFolderDialogState());
      if (folder.id) {
        setSelectedFolderId(folder.id);
      }
    },
    onFolderRenamed: (folder: FolderSummary) => {
      setRenameFolderDialog(createClosedRenameFolderDialogState());
      if (folder.id) {
        setSelectedFolderId(folder.id);
      }
    },
    onFolderDeleted: (_folderId, parentFolderId) => {
      setDeleteFolderTarget(null);
      setSelectedFolderId(parentFolderId ?? UNFILED_FOLDER_ID);
    },
    onNoteDeleted: (note) => {
      removeRecentNoteEntry(note.id, note.teamPath ?? null);
      noteWorkspace.closeByNoteIdentity(note);
      setDeleteTarget(null);
    },
    onNoteMoved: (note, targetFolderId) => {
      setSelectedFolderId(targetFolderId ?? UNFILED_FOLDER_ID);
      noteWorkspace.syncNoteSummary(note);
      void requestSelectNote(note, { trackRecent: true });
    },
  });
  const {
    canCreate,
    canModifySelectedFolder,
    handleFolderSelect,
    handleNoteMove,
    handleShowFinderResults,
    revealFolderIds,
    revealNoteEntry,
    selectedFolder,
    selectedFolderLabel,
    selectedParentFolderId,
    toggleFolderCollapsed,
    visibleEntries,
  } = useWorkbenchNavigator({
    canUseHackmd: hasToken,
    deferredFinderState,
    expandNavigator,
    finderActive,
    focusNavigator: () => focusZone('navigator'),
    moveNote: (operation) => {
      mutations.moveNoteMutation.mutate({
        note: operation.note.note,
        targetFolderId: operation.targetFolderId,
      });
    },
    requestSelectNote,
    scopeType: scope.type,
    selectedFolderId,
    setCollapsedFolderIds,
    setFinderState,
    setSelectedFolderId,
    tree: folderTree,
  });
  const { getAutoSelectSuppressionKey } = useWorkbenchAutoSelection({
    autoSelectSuppressionRef,
    manualEmptyWorkspaceRef,
    requestSelectNote,
    scopeStorageKey,
    selectedFolderId,
    selectedNote,
    visibleEntries,
  });
  const {
    documentContent,
    documentTitle,
    getPaneTabs,
    getPaneView,
    getTabSyncState,
    getTabTitle,
    handleDocumentContentChange,
    handleDocumentTitleChange,
    isTabDirty,
    noteDirty,
    selectedDocument,
  } = useWorkbenchDocuments({
    activeTab,
    deletingNote: mutations.deleteNoteMutation.variables ?? null,
    documentQueriesByKey: documentQueries.byKey,
    documentsByKey,
    drafts: noteWorkspace.state.drafts,
    isDeletingNote: mutations.deleteNoteMutation.isPending,
    isSavingNote: mutations.updateNoteMutation.isPending,
    isUploadingImage: mutations.uploadNoteImageMutation.isPending,
    saveFailedNote: mutations.updateNoteMutation.isError
      ? mutations.updateNoteMutation.variables?.note ?? null
      : null,
    savingNote: mutations.updateNoteMutation.variables?.note ?? null,
    tabs: noteWorkspace.state.tabs,
    updateDraft: noteWorkspace.updateDraft,
    uploadingNote: mutations.uploadNoteImageMutation.variables?.note ?? null,
  });

  const refreshWorkspace = useCallback(() => {
    void queries.userQuery.refetch();
    void queries.teamsQuery.refetch();
    void queries.notesQuery.refetch();
    if (scope.type !== 'history') {
      void queries.foldersQuery.refetch();
      void queries.folderOrderQuery.refetch();
    }
  }, [queries.folderOrderQuery, queries.foldersQuery, queries.notesQuery, queries.teamsQuery, queries.userQuery, scope.type]);

  const handleCreateNote = useCallback(() => {
    if (!hasToken) {
      setSettingsOpen(true);
      return;
    }

    if (scope.type === 'history') {
      toast.info('Choose My Workspace or a team before creating a note.');
      return;
    }

    setCreateDialog({ open: true, title: '' });
  }, [hasToken, scope.type, setCreateDialog, setSettingsOpen]);

  const handleCreateFolder = useCallback(() => {
    if (!hasToken) {
      setSettingsOpen(true);
      return;
    }

    if (scope.type === 'history') {
      toast.info('Choose My Workspace or a team before creating a folder.');
      return;
    }

    setCreateFolderDialog({ ...createClosedFolderDialogState(), open: true });
  }, [hasToken, scope.type, setCreateFolderDialog, setSettingsOpen]);

  const handleCreateFolderInside = useCallback((folderId: string | null) => {
    if (folderId) {
      setSelectedFolderId(folderId);
    } else {
      setSelectedFolderId(UNFILED_FOLDER_ID);
    }

    handleCreateFolder();
  }, [handleCreateFolder, setSelectedFolderId]);

  const handleRenameFolder = useCallback((folderId: string) => {
    const folder = folderTree.nodesById.get(folderId);
    if (!folder) {
      toast.info('Select a folder before renaming it.');
      return;
    }

    const folderSummary = currentFolders.find((candidate) => candidate.id === folderId);
    setRenameFolderDialog({
      open: true,
      folderId,
      name: folder.name,
      description: folderSummary?.description ?? '',
      icon: folder.icon ?? '',
      color: folder.color ?? '',
    });
  }, [currentFolders, folderTree, setRenameFolderDialog]);

  const handleDeleteFolderRequest = useCallback((folderId: string) => {
    const folder = folderTree.nodesById.get(folderId);
    if (!folder) {
      toast.info('Select a folder before deleting it.');
      return;
    }

    if (!api?.app.confirm) {
      setDeleteFolderTarget(folder);
      return;
    }

    api.app.confirm({
      title: 'Delete Folder',
      message: `Delete “${folder.name}”?`,
      detail: 'This removes the folder from HackMD. This action cannot be undone from HackDesk.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    }).then(({ confirmed }) => {
      if (confirmed) {
        mutations.deleteFolderMutation.mutate({ folderId: folder.id, parentFolderId: folder.parentId });
      }
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm folder deletion.');
    });
  }, [api, folderTree, mutations.deleteFolderMutation, setDeleteFolderTarget]);

  const handleFolderDrop = useCallback((operation: FolderDropOperation) => {
    mutations.moveFolderMutation.mutate(operation);
  }, [mutations.moveFolderMutation]);

  const openPalette = useCallback(() => {
    setPalette({ open: true, search: '' });
  }, [setPalette]);

  const {
    handleCopyNoteLink,
    handleCopyNoteMarkdownLink,
    handleDeleteRequest,
    handleDuplicateNote,
    handleExportMarkdown,
    handleExportNoteMarkdown,
    handleImportMarkdownNote,
    handleOpenEditor,
    handleOpenExternal,
  } = useDocumentCommands({
    api,
    deleteNote: mutations.deleteNoteMutation.mutate,
    documentContent,
    documentTitle,
    duplicateNote: mutations.duplicateNoteMutation.mutate,
    importMarkdownNote: mutations.importMarkdownNoteMutation.mutate,
    scopeType: scope.type,
    selectedDocument,
    selectedNote,
    selectedParentFolderId,
    setDeleteTarget,
    trackRecentNote,
  });

  useEffect(() => {
    writeStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`, collapsedFolderIds);
  }, [collapsedFolderIds, scopeStorageKey]);

  const {
    clearPendingRecentNote,
    queuePendingRecentNote,
  } = usePendingRecentNoteRestore({
    isNotesFetching: queries.notesQuery.isFetching,
    isNotesLoading: queries.notesQuery.isLoading,
    removeRecentNoteEntry,
    revealNoteEntry,
    scope,
    tree: folderTree,
  });
  const switchWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    clearPendingRecentNote();
    setWorkspaceScope(nextScope);
  }, [clearPendingRecentNote, setWorkspaceScope]);

  const {
    handleQuickOpenFolder,
    handleQuickOpenNote,
    handleQuickOpenRecentNote,
    handleQuickOpenWorkspace,
  } = useWorkbenchQuickOpen({
    expandNavigator,
    focusNavigator: () => focusZone('navigator'),
    isNotesFetching: queries.notesQuery.isFetching,
    isNotesLoading: queries.notesQuery.isLoading,
    clearPendingRecentNote,
    queuePendingRecentNote,
    removeRecentNoteEntry,
    revealFolderIds,
    revealNoteEntry,
    scope,
    setSelectedFolderId,
    setWorkspaceScope,
    teams,
    tree: folderTree,
  });

  const {
    confirmCloseUnsafeTabs,
    focusTabAtIndex,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
  } = useWorkbenchTabLifecycle({
    activePaneId: noteWorkspace.state.activePaneId,
    api,
    autoSelectSuppressionRef,
    closeOtherTabs: noteWorkspace.closeOtherTabs,
    closeTab: noteWorkspace.closeTab,
    closeTabsToRight: noteWorkspace.closeTabsToRight,
    focusEditor: () => focusZone('editor'),
    getAutoSelectSuppressionKey,
    getTabSyncState,
    getTabTitle,
    isTabDirty,
    manualEmptyWorkspaceRef,
    panes: noteWorkspace.state.panes,
    selectTab: noteWorkspace.selectTab,
    tabs: noteWorkspace.state.tabs,
    visibleEntries,
  });

  const actionHandlers = useWorkbenchActionHandlers({
    activePaneId: noteWorkspace.state.activePaneId,
    activeTab,
    api,
    bumpEditorSearchRequest,
    createFolder: handleCreateFolder,
    createNote: handleCreateNote,
    deleteNote: handleDeleteRequest,
    documentContent,
    documentTitle,
    duplicateActiveTab: noteWorkspace.duplicateActiveTab,
    exportMarkdown: handleExportMarkdown,
    focusNextPane: noteWorkspace.focusNextPane,
    focusNextTab: noteWorkspace.focusNextTab,
    focusPreviousPane: noteWorkspace.focusPreviousPane,
    focusPreviousTab: noteWorkspace.focusPreviousTab,
    focusWorkspaceSearch,
    focusZone,
    importMarkdownNote: handleImportMarkdownNote,
    isSavingNote: mutations.updateNoteMutation.isPending,
    moveActiveTabToOtherPane: noteWorkspace.moveActiveTabToOtherPane,
    navigateBack: noteWorkspace.navigateBack,
    navigateForward: noteWorkspace.navigateForward,
    noteDirty,
    openPalette,
    refreshWorkspace,
    renameFolder: handleRenameFolder,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
    requestDeleteFolder: handleDeleteFolderRequest,
    reopenLastClosedTab: noteWorkspace.reopenLastClosed,
    saveNote: (note, input) => mutations.updateNoteMutation.mutate({ note, input }),
    selectedDocument,
    selectedFolderId: selectedFolder?.id ?? null,
    setSettingsOpen,
    splitActiveTab: noteWorkspace.splitActiveTab,
    switchToHistory: () => switchWorkspaceScope({ type: 'history', label: 'History' }),
    toggleInspector: toggleInspectorCollapsed,
    toggleNavigator: toggleNavigatorCollapsed,
    toggleTheme: () => setTheme(resolvedMode === 'dark' ? 'light' : 'dark'),
    toggleWorkspaceRail: toggleRailCollapsed,
    trackRecentNote,
  });

  const { actionContext, runAction } = useWorkbenchActions({
    canCreate,
    canModifySelectedFolder,
    hasActiveTab: Boolean(activeTab),
    handlers: actionHandlers,
    hasToken,
    inspectorCollapsed,
    isSavingNote: mutations.updateNoteMutation.isPending,
    navigatorCollapsed,
    noteDirty,
    scopeType: scope.type,
    selectedFolderId,
    selectedNoteId: selectedNote?.id ?? null,
    workspaceRailCollapsed: railCollapsed,
    workspaceState: noteWorkspace.state,
  });

  useWorkbenchClosePolicy({
    activeTab,
    api,
    closeTransientLayer,
    confirmCloseUnsafeTabs,
    openTabs: noteWorkspace.state.tabs,
    requestCloseTab,
  });

  useEffect(() => {
    return api?.app.onCommand((command) => {
      runAction(command.type);
    });
  }, [api, runAction]);

  useWorkbenchShortcuts({
    activeFinderState,
    closeTransientLayer,
    focusTabAtIndex,
    handleCreateNote,
    noteDirty,
    openPalette,
    refreshWorkspace,
    runAction,
    selectedFolderId,
    setFinderState,
    setSelectedFolderId,
  });

  const homeStatus = useElectronHomeStatus({
    canCreate,
    finderActive,
    hasToken,
    mutations,
    queries,
    scope,
    selectedFolder,
  });

  if (!api) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background-muted text-sm text-text-subtle">
        Electron API is unavailable.
      </div>
    );
  }

  const activeTitlebarPane = noteWorkspace.state.panes.find((pane) => pane.paneId === noteWorkspace.state.activePaneId) ?? null;
  const activeTitlebarPaneView = activeTitlebarPane ? getPaneView(activeTitlebarPane) : null;
  const activeTitlebarTabs = activeTitlebarPane ? getPaneTabs(activeTitlebarPane) : [];
  return (
    <div className="app-chrome flex h-dvh flex-col overflow-hidden bg-background-muted text-text-default">
      <AppTopBar
        activeTab={activeTitlebarPaneView?.activeTab ?? null}
        getTabSyncState={getTabSyncState}
        navigation={{
          canGoBack: noteWorkspace.state.backStack.length > 0,
          canGoForward: noteWorkspace.state.forwardStack.length > 0,
          onBack: noteWorkspace.navigateBack,
          onForward: noteWorkspace.navigateForward,
        }}
        onCloseOtherTabs={(tabId) => {
          if (activeTitlebarPane) {
            void requestCloseOtherTabs(activeTitlebarPane.paneId, tabId);
          }
        }}
        onCloseTab={(tabId) => {
          void requestCloseTab(tabId);
        }}
        onCloseTabsToRight={(tabId) => {
          if (activeTitlebarPane) {
            void requestCloseTabsToRight(activeTitlebarPane.paneId, tabId);
          }
        }}
        onMoveTabToOtherPane={noteWorkspace.moveActiveTabToOtherPane}
        onReopenLastClosedTab={noteWorkspace.reopenLastClosed}
        onSelectTab={(tabId) => {
          if (activeTitlebarPane) {
            noteWorkspace.selectTab(activeTitlebarPane.paneId, tabId);
          }
        }}
        onSplitPane={noteWorkspace.splitActiveTab}
        paneActions={{
          canMoveToOtherPane: noteWorkspace.state.panes.length > 1,
          canReopenLastClosedTab: noteWorkspace.state.recentlyClosedTabs.length > 0,
          canSplit: noteWorkspace.state.panes.length < 2,
        }}
        navigatorCollapsed={navigatorCollapsed}
        navigatorPanelId={NOTE_NAVIGATOR_PANEL_ID}
        railCollapsed={railCollapsed}
        railPanelId={WORKSPACE_RAIL_PANEL_ID}
        tabs={activeTitlebarTabs}
        onToggleNavigator={toggleNavigatorCollapsed}
        onToggleRail={toggleRailCollapsed}
      />

      <main className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceRail
          id={WORKSPACE_RAIL_PANEL_ID}
          scope={displayScope}
          user={user}
          teams={teams}
          collapsed={railCollapsed}
          width={railWidth}
          onScopeChange={switchWorkspaceScope}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <PanelResizeSash
          label="Resize workspace sidebar"
          value={railWidth}
          min={RAIL_WIDTH_MIN}
          max={RAIL_WIDTH_MAX}
          defaultValue={RAIL_WIDTH_DEFAULT}
          disabled={railCollapsed}
          onChange={(value) => {
            setRailWidth(value);
          }}
        />

        <FolderNavigator
          id={NOTE_NAVIGATOR_PANEL_ID}
          scope={displayScope}
          tree={folderTree}
          entries={visibleEntries}
          finderState={activeFinderState}
          selection={{
            selectedFolderId,
            selectedNoteId: selectedNote?.id ?? null,
          }}
          layout={{
            collapsed: navigatorCollapsed,
            collapsedFolderIds,
            width: navigatorWidth,
          }}
          emptyState={homeStatus.emptyState}
          status={homeStatus.navigatorStatus}
          actions={{
            onFolderSelect: handleFolderSelect,
            onFolderToggle: toggleFolderCollapsed,
            onNoteSelect: handleNoteSelect,
            onFinderStateChange: setFinderState,
            onRefresh: refreshWorkspace,
            onCreate: handleCreateNote,
            onCreateFolder: handleCreateFolder,
            onCreateFolderInside: handleCreateFolderInside,
            onRenameFolder: handleRenameFolder,
            onDeleteFolder: handleDeleteFolderRequest,
            onFolderDrop: handleFolderDrop,
            onNoteMove: handleNoteMove,
            onOpenNote: handleOpenEditor,
            onCopyNoteLink: handleCopyNoteLink,
            onCopyNoteMarkdownLink: handleCopyNoteMarkdownLink,
            onDuplicateNote: handleDuplicateNote,
            onExportNoteMarkdown: handleExportNoteMarkdown,
            onDeleteNote: handleDeleteRequest,
            onImportMarkdown: handleImportMarkdownNote,
            onToggleCollapsed: toggleNavigatorCollapsed,
            onOpenPalette: openPalette,
            onOpenSettings: openHackmdTokenSetup,
          }}
        />
        <PanelResizeSash
          label="Resize note navigator"
          value={navigatorWidth}
          min={NAVIGATOR_WIDTH_MIN}
          max={NAVIGATOR_WIDTH_MAX}
          defaultValue={NAVIGATOR_WIDTH_DEFAULT}
          disabled={navigatorCollapsed}
          onChange={(value) => {
            setNavigatorWidth(value);
          }}
        />

        <DocumentWorkspace
          panes={noteWorkspace.state.panes}
          activePaneId={noteWorkspace.state.activePaneId}
          folderTree={folderTree}
          shareOpen={shareOpen}
          isInspectorCollapsed={inspectorCollapsed}
          getPaneView={getPaneView}
          editorSearchRequestId={editorSearchRequestId}
          onResizePanes={noteWorkspace.resizePanes}
          onFocusPane={noteWorkspace.focusPane}
          onOpenEditor={handleOpenEditor}
          onOpenExternal={handleOpenExternal}
          onCopyLink={handleCopyNoteLink}
          onCopyMarkdownLink={handleCopyNoteMarkdownLink}
          onExportMarkdown={handleExportMarkdown}
          onSave={(note, input) => mutations.updateNoteMutation.mutate({ note, input })}
          onSaveMetadata={(note, input) => mutations.updateNoteMutation.mutate({ note, input })}
          onSaveSharing={(note, input) => mutations.updateNoteMutation.mutate({
            note,
            input,
            successMessage: 'Sharing settings updated.',
          })}
          onUploadImage={(note, input) => mutations.uploadNoteImageMutation.mutateAsync({ note, input })}
          onDelete={handleDeleteRequest}
          onTitleChange={handleDocumentTitleChange}
          onContentChange={handleDocumentContentChange}
          onToggleInspector={toggleInspectorCollapsed}
          onShareOpenChange={setShareOpen}
        />
      </main>

      <CommandPaletteDialog
        state={palette}
        context={actionContext}
        folderTree={folderTree}
        recentNotes={recentNotes}
        teams={teams}
        scope={displayScope}
        selectedNoteId={selectedNote?.id ?? null}
        selectedFolderId={selectedFolderId}
        onStateChange={setPalette}
        onRunAction={runAction}
        onSelectNote={handleQuickOpenNote}
        onSelectRecentNote={handleQuickOpenRecentNote}
        onSelectFolder={handleQuickOpenFolder}
        onSelectWorkspace={handleQuickOpenWorkspace}
        onShowFinderResults={handleShowFinderResults}
      />

      <ElectronHomeDialogs
        api={api}
        createFolderDialog={createFolderDialog}
        createNoteDialog={createDialog}
        deleteFolderTarget={deleteFolderTarget}
        deleteNoteTarget={deleteTarget}
        folderLabel={selectedFolderLabel}
        onboardingOpen={onboardingOpen}
        renameFolderDialog={renameFolderDialog}
        scopeLabel={displayScope.label}
        settings={settings}
        settingsOpen={settingsOpen}
        status={{
          creatingFolder: mutations.createFolderMutation.isPending,
          creatingNote: mutations.createNoteMutation.isPending,
          deletingFolder: mutations.deleteFolderMutation.isPending,
          deletingNote: mutations.deleteNoteMutation.isPending,
          renamingFolder: mutations.renameFolderMutation.isPending,
          savingSettings: mutations.updateSettingsMutation.isPending,
        }}
        onCreateFolder={(input) => mutations.createFolderMutation.mutate(input)}
        onCreateFolderStateChange={setCreateFolderDialog}
        onCreateNote={(title) => mutations.createNoteMutation.mutate(title)}
        onCreateNoteStateChange={setCreateDialog}
        onDeleteFolder={(folder) => mutations.deleteFolderMutation.mutate({
          folderId: folder.id,
          parentFolderId: folder.parentId,
        })}
        onDeleteFolderCancel={() => setDeleteFolderTarget(null)}
        onDeleteNote={(note) => mutations.deleteNoteMutation.mutate(note)}
        onDeleteNoteCancel={() => setDeleteTarget(null)}
        onImportHackmdCliToken={() => mutations.importHackmdCliTokenMutation.mutateAsync()}
        onOnboardingOpenChange={setOnboardingOpen}
        onRenameFolder={(folderId, input) => mutations.renameFolderMutation.mutate({ folderId, input })}
        onRenameFolderStateChange={setRenameFolderDialog}
        onSaveSettings={(input) => mutations.updateSettingsMutation.mutate(input)}
        onSaveToken={async (token) => {
          await mutations.updateSettingsMutation.mutateAsync({
            title: settings?.title ?? 'HackDesk',
            hackmdApiToken: token,
          });
        }}
        onSettingsOpenChange={setSettingsOpen}
        onSetupLater={async () => {
          await mutations.updateSettingsMutation.mutateAsync({
            title: settings?.title ?? 'HackDesk',
            onboarding: { hackmdTokenSetupDeferred: true },
          });
        }}
      />
    </div>
  );
}
