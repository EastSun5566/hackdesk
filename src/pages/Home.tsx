import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import { CommandPaletteDialog } from './electron-home/CommandPaletteDialog';
import { ElectronHomeDialogs } from './electron-home/ElectronHomeDialogs';
import { ElectronHomeWorkspace } from './electron-home/ElectronHomeWorkspace';
import { getScopeStorageKey } from './electron-home/repository';
import type { NoteIdentity } from './electron-home/note-workspace';
import type { WorkspaceScope } from './electron-home/types';
import {
  FOLDER_COLLAPSED_PREFIX,
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
import { useWorkbenchFolderCommands } from './electron-home/useWorkbenchFolderCommands';
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

export function Home() {
  const { resolvedMode, setTheme } = useTheme();
  const api = getDesktopAPI();
  const initialWorkspaceScope = useMemo(() => getInitialWorkspaceScope(), []);
  const [recentNotes, setRecentNotes] = useState<ElectronRecentNote[]>(() => readRecentNotes(window.localStorage));
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const autoSelectSuppressionRef = useRef<string | null>(null);
  const manualEmptyWorkspaceRef = useRef(false);
  const pendingEditorFocusNoteIdRef = useRef<string | null>(null);
  const [editorFocusRequestId, setEditorFocusRequestId] = useState(0);
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
      pendingEditorFocusNoteIdRef.current = note.id;
      setEditorFocusRequestId((requestId) => requestId + 1);
    }

    return true;
  }, [openNoteInWorkspace, trackRecentNote]);

  const handleNoteSelect = useCallback((note: NoteSummary) => {
    void requestSelectNote(note, { focusEditor: true, trackRecent: true });
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

  useEffect(() => {
    if (!selectedDocument || pendingEditorFocusNoteIdRef.current !== selectedDocument.id) {
      return;
    }

    pendingEditorFocusNoteIdRef.current = null;
    setEditorFocusRequestId((requestId) => requestId + 1);
  }, [selectedDocument]);

  const refreshWorkspace = useCallback(() => {
    void queries.userQuery.refetch();
    void queries.teamsQuery.refetch();
    void queries.notesQuery.refetch();
    if (scope.type !== 'history') {
      void queries.foldersQuery.refetch();
      void queries.folderOrderQuery.refetch();
    }
  }, [queries.folderOrderQuery, queries.foldersQuery, queries.notesQuery, queries.teamsQuery, queries.userQuery, scope.type]);

  const folderCommands = useWorkbenchFolderCommands({
    api,
    currentFolders,
    deleteFolder: mutations.deleteFolderMutation.mutate,
    folderTree,
    hasToken,
    moveFolder: mutations.moveFolderMutation.mutate,
    scopeType: scope.type,
    setCreateDialog,
    setCreateFolderDialog,
    setDeleteFolderTarget,
    setRenameFolderDialog,
    setSelectedFolderId,
    setSettingsOpen,
  });

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
    createFolder: folderCommands.handleCreateFolder,
    createNote: folderCommands.handleCreateNote,
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
    renameFolder: folderCommands.handleRenameFolder,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
    requestDeleteFolder: folderCommands.handleDeleteFolderRequest,
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
    handleCreateNote: folderCommands.handleCreateNote,
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

  return (
    <div className="app-chrome flex h-dvh flex-col overflow-hidden bg-background-muted text-text-default">
      <ElectronHomeWorkspace
        titlebar={{
          getPaneTabs,
          getPaneView,
          getTabSyncState,
          layout: {
            navigatorCollapsed,
            railCollapsed,
          },
          state: {
            activePaneId: noteWorkspace.state.activePaneId,
            backStack: noteWorkspace.state.backStack,
            forwardStack: noteWorkspace.state.forwardStack,
            panes: noteWorkspace.state.panes,
            recentlyClosedTabs: noteWorkspace.state.recentlyClosedTabs,
          },
          actions: {
            moveActiveTabToOtherPane: noteWorkspace.moveActiveTabToOtherPane,
            navigateBack: noteWorkspace.navigateBack,
            navigateForward: noteWorkspace.navigateForward,
            reopenLastClosedTab: noteWorkspace.reopenLastClosed,
            requestCloseOtherTabs,
            requestCloseTab,
            requestCloseTabsToRight,
            selectTab: noteWorkspace.selectTab,
            splitActiveTab: noteWorkspace.splitActiveTab,
            toggleNavigator: toggleNavigatorCollapsed,
            toggleRail: toggleRailCollapsed,
          },
        }}
        rail={{
          scope: displayScope,
          user,
          teams,
          collapsed: railCollapsed,
          width: railWidth,
          onScopeChange: switchWorkspaceScope,
          onOpenSettings: () => setSettingsOpen(true),
        }}
        railResize={{
          disabled: railCollapsed,
          value: railWidth,
          onChange: setRailWidth,
        }}
        navigator={{
          scope: displayScope,
          tree: folderTree,
          entries: visibleEntries,
          finderState: activeFinderState,
          selection: {
            selectedFolderId,
            selectedNoteId: selectedNote?.id ?? null,
          },
          layout: {
            collapsed: navigatorCollapsed,
            collapsedFolderIds,
            width: navigatorWidth,
          },
          emptyState: homeStatus.emptyState,
          status: homeStatus.navigatorStatus,
          actions: {
            onFolderSelect: handleFolderSelect,
            onFolderToggle: toggleFolderCollapsed,
            onNoteSelect: handleNoteSelect,
            onFinderStateChange: setFinderState,
            onRefresh: refreshWorkspace,
            onCreate: folderCommands.handleCreateNote,
            onCreateFolder: folderCommands.handleCreateFolder,
            onCreateFolderInside: folderCommands.handleCreateFolderInside,
            onCreateNoteInside: folderCommands.handleCreateNoteInside,
            onRenameFolder: folderCommands.handleRenameFolder,
            onDeleteFolder: folderCommands.handleDeleteFolderRequest,
            onFolderDrop: folderCommands.handleFolderDrop,
            onNoteMove: handleNoteMove,
            onOpenNote: handleOpenEditor,
            onRevealNoteFolder: (entry) => {
              void revealNoteEntry(entry);
            },
            onCopyNoteLink: handleCopyNoteLink,
            onCopyNoteMarkdownLink: handleCopyNoteMarkdownLink,
            onDuplicateNote: handleDuplicateNote,
            onExportNoteMarkdown: handleExportNoteMarkdown,
            onDeleteNote: handleDeleteRequest,
            onImportMarkdown: handleImportMarkdownNote,
            onToggleCollapsed: toggleNavigatorCollapsed,
            onOpenPalette: openPalette,
            onOpenSettings: openHackmdTokenSetup,
          },
        }}
        navigatorResize={{
          disabled: navigatorCollapsed,
          value: navigatorWidth,
          onChange: setNavigatorWidth,
        }}
        documentWorkspace={{
          panes: noteWorkspace.state.panes,
          activePaneId: noteWorkspace.state.activePaneId,
          folderTree,
          shareOpen,
          isInspectorCollapsed: inspectorCollapsed,
          getPaneView,
          editorSearchRequestId,
          editorFocusRequestId,
          onResizePanes: noteWorkspace.resizePanes,
          onFocusPane: noteWorkspace.focusPane,
          onOpenEditor: handleOpenEditor,
          onOpenExternal: handleOpenExternal,
          onCopyLink: handleCopyNoteLink,
          onCopyMarkdownLink: handleCopyNoteMarkdownLink,
          onExportMarkdown: handleExportMarkdown,
          onSave: (note, input) => mutations.updateNoteMutation.mutate({ note, input }),
          onSaveMetadata: (note, input) => mutations.updateNoteMutation.mutate({ note, input }),
          onSaveSharing: (note, input) => mutations.updateNoteMutation.mutate({
            note,
            input,
            successMessage: 'Sharing settings updated.',
          }),
          onUploadImage: (note, input) => mutations.uploadNoteImageMutation.mutateAsync({ note, input }),
          onDelete: handleDeleteRequest,
          onTitleChange: handleDocumentTitleChange,
          onContentChange: handleDocumentContentChange,
          onToggleInspector: toggleInspectorCollapsed,
          onShareOpenChange: setShareOpen,
        }}
      />

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
