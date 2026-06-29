import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';

import { useTheme } from '@/components/theme-provider';
import { getDesktopAPI } from '@/lib/desktop-api';
import type { FolderSummary } from '@/lib/electron-api';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { defaultSettings } from '@/lib/settings';

import { ElectronHomeOverlays } from './electron-home/ElectronHomeOverlays';
import { ElectronHomeWorkspace } from './electron-home/ElectronHomeWorkspace';
import { getScopeStorageKey } from './electron-home/repository';
import type { WorkspaceScope } from './electron-home/types';
import { useElectronHackmdQueries } from './electron-home/useElectronHackmdQueries';
import { useElectronFocusZones } from './electron-home/useElectronFocusZones';
import { useElectronHomeCommandPalette } from './electron-home/useElectronHomeCommandPalette';
import { useElectronHomeModel } from './electron-home/useElectronHomeModel';
import { useElectronHomeRecentNotes } from './electron-home/useElectronHomeRecentNotes';
import { useElectronHomeRefresh } from './electron-home/useElectronHomeRefresh';
import {
  getLocalVaultSnapshotQueryKey,
  useElectronLocalVault,
} from './electron-home/useElectronLocalVault';
import { LOCAL_VAULT_TEAM_PATH } from './electron-home/local-vault-adapter';
import {
  useElectronHomeSelection,
  useElectronHomeSelectionRefs,
  useSelectedDocumentEditorFocus,
} from './electron-home/useElectronHomeSelection';
import { useElectronHomeShellEffects } from './electron-home/useElectronHomeShellEffects';
import { useElectronNoteMutations } from './electron-home/useElectronNoteMutations';
import { useDocumentCommands } from './electron-home/useDocumentCommands';
import { useLocalDocumentRecovery } from './electron-home/useLocalDocumentRecovery';
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
import { useWorkbenchPanelState } from './electron-home/useWorkbenchPanelState';
import { useWorkbenchShortcuts } from './electron-home/useWorkbenchShortcuts';
import { useWorkbenchTabLifecycle } from './electron-home/useWorkbenchTabLifecycle';
import {
  getInitialWorkspaceScope,
  useWorkbenchWorkspaceState,
} from './electron-home/useWorkbenchWorkspaceState';

export function Home() {
  const { resolvedMode, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const api = getDesktopAPI();
  const initialWorkspaceScope = useMemo(() => getInitialWorkspaceScope(), []);
  const { recentNotes, removeRecentNoteEntry, trackRecentNote } = useElectronHomeRecentNotes();
  const selectionRefs = useElectronHomeSelectionRefs();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
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
    manualEmptyWorkspaceRef: selectionRefs.manualEmptyWorkspaceRef,
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
    attachImageRequestId,
    editorSearchRequestId,
    inspectorCollapsed,
    navigatorCollapsed,
    navigatorWidth,
    railCollapsed,
    railWidth,
    bumpAttachImageRequest,
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
  const activeTab = noteWorkspace.activeTab;
  const {
    autoSelectSuppressionRef,
    editorFocusRequestId,
    handleNoteSelect,
    handleSelectedDocumentReady,
    manualEmptyWorkspaceRef,
    requestSelectNote,
    selectedNote,
  } = useElectronHomeSelection({
    activeTab,
    openNoteInWorkspace: noteWorkspace.openNote,
    selectionRefs,
    trackRecentNote,
  });
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
  const handleChooseLocalVault = useCallback(async () => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    const result = await api.localVault.choose();
    if (result.canceled) {
      return;
    }

    if (result.settings) {
      queryClient.setQueryData(['electron', 'settings'], result.settings);
    }
    if (result.snapshot) {
      queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), result.snapshot);
    }
    setWorkspaceScope({ type: 'local', label: 'Local Vault' });
  }, [api, queryClient, setWorkspaceScope]);
  const handleOpenLocalVault = useCallback(async () => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    await api.localVault.revealRoot();
  }, [api]);
  const handleRevealLocalNote = useCallback((note: { id: string; teamPath: string | null }) => {
    if (!api || note.teamPath !== LOCAL_VAULT_TEAM_PATH) {
      return;
    }

    void api.localVault.revealNote({ noteId: note.id }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to reveal local note.');
    });
  }, [api]);
  const handleRevealLocalFolder = useCallback((folderId: string) => {
    const prefix = 'local-folder:';
    if (!api || !folderId.startsWith(prefix)) {
      return;
    }

    void api.localVault.revealFolder({ relativePath: folderId.slice(prefix.length) }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to reveal local folder.');
    });
  }, [api]);
  const handleForgetLocalVault = useCallback(async () => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    const { confirmed } = await api.app.confirm({
      title: 'Forget Local Vault',
      message: 'Forget this local vault?',
      detail: 'HackDesk will stop opening this folder automatically. Your Markdown files will not be deleted.',
      confirmLabel: 'Forget Vault',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    const nextSettings = await api.settings.update({
      localVault: { path: null },
    });
    queryClient.setQueryData(['electron', 'settings'], nextSettings);
    queryClient.setQueryData(getLocalVaultSnapshotQueryKey(), null);
    toast.success('Local vault forgotten. Your files were not deleted.');
  }, [api, queryClient]);
  const { focusZone } = useElectronFocusZones();

  const {
    settings,
    hasToken,
    user,
    teams,
    currentNotes: remoteNotes,
    currentFolders: remoteFolders,
    currentFolderOrder: remoteFolderOrder,
    documentsByKey: remoteDocumentsByKey,
    documentQueries: remoteDocumentQueries,
    queries: remoteQueries,
  } = useElectronHackmdQueries({
    api,
    scope,
    selectedNote,
    activeDocumentNotes: noteWorkspace.visibleActiveTabs.map((tab) => ({
      id: tab.noteId,
      teamPath: tab.teamPath,
    })),
  });
  const localVault = useElectronLocalVault({
    api,
    enabled: settings?.hasLocalVault === true,
    selectedNote,
    activeDocumentNotes: noteWorkspace.visibleActiveTabs.map((tab) => ({
      id: tab.noteId,
      teamPath: tab.teamPath,
    })),
  });
  const handleRefreshLocalVault = useCallback(async () => {
    await localVault.snapshotQuery.refetch();
  }, [localVault.snapshotQuery]);
  const currentNotes = scope.type === 'local' ? localVault.currentNotes : remoteNotes;
  const currentFolders = scope.type === 'local' ? localVault.currentFolders : remoteFolders;
  const currentFolderOrder = scope.type === 'local' ? undefined : remoteFolderOrder;
  const documentsByKey = scope.type === 'local' ? localVault.documentsByKey : remoteDocumentsByKey;
  const documentQueries = scope.type === 'local' ? localVault.documentQueries : remoteDocumentQueries;
  const queries = remoteQueries;
  const hasConfiguredLocalVault = settings?.hasLocalVault === true;
  const canUseCurrentWorkspace = hasToken || (scope.type === 'local' && hasConfiguredLocalVault);

  useEffect(() => {
    if (settings?.hasLocalVault && scope.type !== 'local' && initialWorkspaceScope.type === 'personal') {
      setWorkspaceScope({ type: 'local', label: 'Local Vault' });
      return;
    }

    if (settings?.shouldShowHackmdOnboarding && !settingsOpen) {
      setOnboardingOpen(true);
    }
  }, [
    initialWorkspaceScope.type,
    scope.type,
    setWorkspaceScope,
    settings?.hasLocalVault,
    settings?.shouldShowHackmdOnboarding,
    settingsOpen,
  ]);

  const {
    displayScope,
    folderTree,
    selectedParentFolderIdForMutation,
  } = useElectronHomeModel({
    currentFolderOrder,
    currentFolders,
    currentNotes,
    scope,
    selectedFolderId,
    syncOpenNoteSummaries: noteWorkspace.syncNoteSummaries,
    teams,
  });

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
    onNoteSaved: (note) => {
      noteWorkspace.syncNoteSummary(note);
      trackRecentNote(note);
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
  const localDocumentRecovery = useLocalDocumentRecovery({
    api,
    clearDraft: noteWorkspace.clearDraft,
    documentQueries: localVault.documentQueries,
    drafts: noteWorkspace.state.drafts,
    enabled: scope.type === 'local',
    getTabsMatching: noteWorkspace.getTabsMatching,
    notes: localVault.currentNotes,
    openNote: noteWorkspace.openNote,
    resetSaveMutation: mutations.updateNoteMutation.reset,
    syncNoteSummary: noteWorkspace.syncNoteSummary,
    tabs: noteWorkspace.state.tabs,
    trackRecentNote,
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
    canUseHackmd: canUseCurrentWorkspace,
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
    latestLocalRevisionByNoteId: localDocumentRecovery.latestLocalRevisionByNoteId,
    saveError: mutations.updateNoteMutation.error,
    saveFailedNote: mutations.updateNoteMutation.isError
      ? mutations.updateNoteMutation.variables?.note ?? null
      : null,
    savingNote: mutations.updateNoteMutation.variables?.note ?? null,
    tabs: noteWorkspace.state.tabs,
    updateDraft: noteWorkspace.updateDraft,
    uploadingNote: mutations.uploadNoteImageMutation.variables?.note ?? null,
  });

  useSelectedDocumentEditorFocus(selectedDocument, handleSelectedDocumentReady);

  const refreshWorkspace = useElectronHomeRefresh({
    localVaultQuery: localVault.snapshotQuery,
    queries,
    scopeType: scope.type,
  });

  const folderCommands = useWorkbenchFolderCommands({
    api,
    currentFolders,
    deleteFolder: mutations.deleteFolderMutation.mutate,
    folderTree,
    hasLocalVault: hasConfiguredLocalVault,
    hasToken,
    moveFolder: mutations.moveFolderMutation.mutate,
    onChooseLocalVault: () => {
      void handleChooseLocalVault();
    },
    scopeType: scope.type,
    setCreateDialog,
    setCreateFolderDialog,
    setDeleteFolderTarget,
    setRenameFolderDialog,
    setSelectedFolderId,
    setSettingsOpen,
  });

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

  const {
    commandPaletteProps,
    openPalette,
    switchWorkspaceScope,
  } = useElectronHomeCommandPalette({
    displayScope,
    expandNavigator,
    focusNavigator: () => focusZone('navigator'),
    handleShowFinderResults,
    isNotesFetching: queries.notesQuery.isFetching,
    isNotesLoading: queries.notesQuery.isLoading,
    palette,
    recentNotes,
    removeRecentNoteEntry,
    revealFolderIds,
    revealNoteEntry,
    scope,
    selectedFolderId,
    selectedNoteId: selectedNote?.id ?? null,
    setPalette,
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
    bumpAttachImageRequest,
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
    setEditorMode: (mode) => {
      mutations.updateSettingsMutation.mutate({
        title: settings?.title ?? defaultSettings.title,
        editor: { mode },
      });
      focusZone('editor');
    },
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
    editorMode: settings?.editor?.mode ?? defaultSettings.editor.mode,
    hasActiveTab: Boolean(activeTab),
    handlers: actionHandlers,
    hasToken: canUseCurrentWorkspace,
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

  useElectronHomeShellEffects({
    api,
    collapsedFolderIds,
    runAction,
    scopeStorageKey,
  });

  const openHackmdTokenSetup = useCallback(() => {
    setOnboardingOpen(true);
  }, [setOnboardingOpen]);

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
    hasLocalVault: hasConfiguredLocalVault,
    hasToken: canUseCurrentWorkspace,
    localVaultError: localVault.snapshotQuery.error instanceof Error
      ? localVault.snapshotQuery.error.message
      : null,
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
          localVaultConfigured: hasConfiguredLocalVault,
          width: railWidth,
          onChooseLocalVault: () => {
            void handleChooseLocalVault();
          },
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
            onFolderRevealInFinder: handleRevealLocalFolder,
            onNoteSelect: handleNoteSelect,
            onNoteRevealInFinder: handleRevealLocalNote,
            onFinderStateChange: setFinderState,
            onRefresh: refreshWorkspace,
            onCreate: folderCommands.handleCreateNote,
            onCreateFolder: folderCommands.handleCreateFolder,
            onCreateFolderInside: folderCommands.handleCreateFolderInside,
            onCreateNoteInside: folderCommands.handleCreateNoteInside,
            onChooseLocalVault: () => {
              void handleChooseLocalVault();
            },
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
          editorMode: settings?.editor?.mode ?? defaultSettings.editor.mode,
          folderTree,
          shareOpen,
          isInspectorCollapsed: inspectorCollapsed,
          getPaneView,
          editorSearchRequestId,
          attachImageRequestId,
          editorFocusRequestId,
          onResizePanes: noteWorkspace.resizePanes,
          onFocusPane: noteWorkspace.focusPane,
          onOpenEditor: handleOpenEditor,
          onOpenExternal: handleOpenExternal,
          onRevealInFinder: handleRevealLocalNote,
          onCopyLink: handleCopyNoteLink,
          onCopyMarkdownLink: handleCopyNoteMarkdownLink,
          onExportMarkdown: handleExportMarkdown,
          onReloadFromDisk: localDocumentRecovery.reloadFromDisk,
          onSave: (note, input) => mutations.updateNoteMutation.mutate({ note, input }),
          onSaveAsCopy: localDocumentRecovery.saveAsCopy,
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

      <ElectronHomeOverlays
        commandPalette={{
          ...commandPaletteProps,
          context: actionContext,
          onRunAction: runAction,
        }}
        dialogs={{
          api,
          createFolderDialog,
          createNoteDialog: createDialog,
          deleteFolderTarget,
          deleteNoteTarget: deleteTarget,
          folderLabel: selectedFolderLabel,
          onboardingOpen,
          renameFolderDialog,
          scopeLabel: displayScope.label,
          settings,
          localVaultError: localVault.snapshotQuery.error instanceof Error
            ? localVault.snapshotQuery.error.message
            : null,
          localVaultSnapshot: localVault.snapshot,
          settingsOpen,
          status: {
            creatingFolder: mutations.createFolderMutation.isPending,
            creatingNote: mutations.createNoteMutation.isPending,
            deletingFolder: mutations.deleteFolderMutation.isPending,
            deletingNote: mutations.deleteNoteMutation.isPending,
            renamingFolder: mutations.renameFolderMutation.isPending,
            savingSettings: mutations.updateSettingsMutation.isPending,
          },
          onCreateFolder: (input) => mutations.createFolderMutation.mutate(input),
          onCreateFolderStateChange: setCreateFolderDialog,
          onCreateNote: (title) => mutations.createNoteMutation.mutate(title),
          onCreateNoteStateChange: setCreateDialog,
          onChooseLocalVault: handleChooseLocalVault,
          onDeleteFolder: (folder) => mutations.deleteFolderMutation.mutate({
            folderId: folder.id,
            parentFolderId: folder.parentId,
          }),
          onDeleteFolderCancel: () => setDeleteFolderTarget(null),
          onDeleteNote: (note) => mutations.deleteNoteMutation.mutate(note),
          onDeleteNoteCancel: () => setDeleteTarget(null),
          onImportHackmdCliToken: () => mutations.importHackmdCliTokenMutation.mutateAsync(),
          onForgetLocalVault: handleForgetLocalVault,
          onOpenLocalVault: handleOpenLocalVault,
          onOnboardingOpenChange: setOnboardingOpen,
          onRefreshLocalVault: handleRefreshLocalVault,
          onRenameFolder: (folderId, input) => mutations.renameFolderMutation.mutate({ folderId, input }),
          onRenameFolderStateChange: setRenameFolderDialog,
          onSaveSettings: (input) => mutations.updateSettingsMutation.mutate(input),
          onSaveToken: async (token) => {
            await mutations.updateSettingsMutation.mutateAsync({
              title: settings?.title ?? 'HackDesk',
              hackmdApiToken: token,
            });
          },
          onSettingsOpenChange: setSettingsOpen,
          onSetupLater: async () => {
            await mutations.updateSettingsMutation.mutateAsync({
              title: settings?.title ?? 'HackDesk',
              onboarding: { hackmdTokenSetupDeferred: true },
            });
          },
        }}
      />
    </div>
  );
}
