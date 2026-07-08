import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/components/theme-provider';
import { getDesktopAPI } from '@/lib/desktop-api';
import type { FolderSummary } from '@/lib/electron-api';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { defaultSettings } from '@/lib/settings';

import { ElectronHomeOverlays } from './electron-home/ElectronHomeOverlays';
import { ElectronHomeWorkspace } from './electron-home/ElectronHomeWorkspace';
import { getScopeStorageKey } from './electron-home/repository';
import { LOCAL_VAULT_TEAM_PATH } from './electron-home/local-vault-adapter';
import type { WorkspaceScope } from './electron-home/types';
import { useElectronHackmdQueries } from './electron-home/useElectronHackmdQueries';
import { useElectronFocusZones } from './electron-home/useElectronFocusZones';
import { useElectronHomeCommandPalette } from './electron-home/useElectronHomeCommandPalette';
import { useElectronHomeModel } from './electron-home/useElectronHomeModel';
import { useElectronHomeRecentNotes } from './electron-home/useElectronHomeRecentNotes';
import { useElectronHomeRefresh } from './electron-home/useElectronHomeRefresh';
import { useElectronLocalVault } from './electron-home/useElectronLocalVault';
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
import { useHomeLocalVaultActions } from './electron-home/useHomeLocalVaultActions';
import { useHomeOverlayProps } from './electron-home/useHomeOverlayProps';
import { useHomeWorkspaceProps } from './electron-home/useHomeWorkspaceProps';
import { getSavedTabNoteIdentity, isDraftNoteTab } from './electron-home/note-workspace';
import {
  DEFAULT_WORKSPACE_SCOPE,
  getInitialWorkspaceScope,
  useWorkbenchWorkspaceState,
} from './electron-home/useWorkbenchWorkspaceState';

export function Home() {
  const { presets, presetId, resolvedMode, setPresetId, setTheme, theme } = useTheme();
  const queryClient = useQueryClient();
  const api = getDesktopAPI();
  const initialWorkspaceScope = useMemo(() => getInitialWorkspaceScope(), []);
  const { recentNotes, removeRecentNoteEntry, trackRecentNote } = useElectronHomeRecentNotes();
  const selectionRefs = useElectronHomeSelectionRefs();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const initialWorkspaceResolvedRef = useRef(false);
  const panelState = useWorkbenchPanelState();
  const dialogState = useWorkbenchDialogState();
  const {
    closeTransientLayer,
    palette,
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
  const handleOnboardingConnected = useCallback(() => {
    setWorkspaceScope(DEFAULT_WORKSPACE_SCOPE);
  }, [setWorkspaceScope]);
  const { focusZone } = useElectronFocusZones();
  const activeDocumentNotes = useMemo(() => (
    noteWorkspace.visibleActiveTabs
      .map(getSavedTabNoteIdentity)
      .filter((note): note is NonNullable<typeof note> => Boolean(note))
  ), [noteWorkspace.visibleActiveTabs]);

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
    activeDocumentNotes,
  });
  const localVault = useElectronLocalVault({
    api,
    enabled: settings?.hasLocalVault === true,
    selectedNote,
    activeDocumentNotes,
  });
  const localVaultActions = useHomeLocalVaultActions({
    api,
    queryClient,
    refetchLocalVault: async () => {
      await localVault.snapshotQuery.refetch();
    },
    setWorkspaceScope,
  });
  const currentNotes = scope.type === 'local' ? localVault.currentNotes : remoteNotes;
  const currentFolders = scope.type === 'local' ? localVault.currentFolders : remoteFolders;
  const currentFolderOrder = scope.type === 'local' ? undefined : remoteFolderOrder;
  const documentsByKey = scope.type === 'local' ? localVault.documentsByKey : remoteDocumentsByKey;
  const documentQueries = scope.type === 'local' ? localVault.documentQueries : remoteDocumentQueries;
  const queries = remoteQueries;
  const hasConfiguredLocalVault = settings?.hasLocalVault === true;
  const canUseCurrentWorkspace = hasToken || (scope.type === 'local' && hasConfiguredLocalVault);
  const handleHackmdDisconnected = useCallback(() => {
    setWorkspaceScope(hasConfiguredLocalVault
      ? { type: 'local', label: 'Local Vault' }
      : DEFAULT_WORKSPACE_SCOPE);
  }, [hasConfiguredLocalVault, setWorkspaceScope]);

  useEffect(() => {
    if (settings === undefined || initialWorkspaceResolvedRef.current) {
      return;
    }

    initialWorkspaceResolvedRef.current = true;
    if (settings.hasLocalVault && scope.type !== 'local' && initialWorkspaceScope.type === 'personal') {
      setWorkspaceScope({ type: 'local', label: 'Local Vault' });
    }
  }, [initialWorkspaceScope.type, scope.type, setWorkspaceScope, settings]);

  useEffect(() => {
    if (settings?.shouldShowHackmdOnboarding && !settingsOpen) {
      setOnboardingOpen(true);
    }
  }, [
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
    onDraftNoteCreated: (tabId, note) => {
      noteWorkspace.materializeDraftNote(tabId, note);
      noteWorkspace.syncNoteSummary(note);
      trackRecentNote(note);
    },
    onNoteSaved: (note) => {
      noteWorkspace.syncNoteSummary(note);
      for (const tab of noteWorkspace.getTabsMatching(note)) {
        noteWorkspace.clearDraft(tab.tabId);
      }
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
  const workbenchNavigator = useWorkbenchNavigator({
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
  const {
    canCreate,
    canModifySelectedFolder,
    handleShowFinderResults,
    revealFolderIds,
    revealNoteEntry,
    selectedFolder,
    selectedFolderLabel,
    selectedParentFolderId,
    visibleEntries,
  } = workbenchNavigator;
  const { getAutoSelectSuppressionKey } = useWorkbenchAutoSelection({
    autoSelectSuppressionRef,
    hasActiveDocument: Boolean(activeTab),
    manualEmptyWorkspaceRef,
    requestSelectNote,
    scopeStorageKey,
    selectedFolderId,
    selectedNote,
    visibleEntries,
  });
  const workbenchDocuments = useWorkbenchDocuments({
    activeTab,
    deletingNote: mutations.deleteNoteMutation.variables ?? null,
    documentQueriesByKey: documentQueries.byKey,
    documentsByKey,
    drafts: noteWorkspace.state.drafts,
    isDeletingNote: mutations.deleteNoteMutation.isPending,
    isSavingNote: mutations.updateNoteMutation.isPending || mutations.createDraftNoteMutation.isPending,
    isSavingDraftNote: mutations.createDraftNoteMutation.isPending,
    isUploadingImage: mutations.uploadNoteImageMutation.isPending,
    latestLocalRevisionByNoteId: localDocumentRecovery.latestLocalRevisionByNoteId,
    saveError: mutations.updateNoteMutation.error,
    draftSaveError: mutations.createDraftNoteMutation.error,
    saveFailedNote: mutations.updateNoteMutation.isError
      ? mutations.updateNoteMutation.variables?.note ?? null
      : null,
    saveFailedDraftTabId: mutations.createDraftNoteMutation.isError
      ? mutations.createDraftNoteMutation.variables?.tabId ?? null
      : null,
    savingDraftTabId: mutations.createDraftNoteMutation.variables?.tabId ?? null,
    savingNote: mutations.updateNoteMutation.variables?.note ?? null,
    tabs: noteWorkspace.state.tabs,
    updateDraft: noteWorkspace.updateDraft,
    uploadingNote: mutations.uploadNoteImageMutation.variables?.note ?? null,
  });
  const {
    documentContent,
    documentTitle,
    getTabSyncState,
    getTabTitle,
    isTabDirty,
    noteDirty,
    selectedDocument,
  } = workbenchDocuments;

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
      void localVaultActions.chooseLocalVault();
    },
    openDraftNote: () => {
      noteWorkspace.openDraftNote();
      focusZone('editor');
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
    openQuickOpen,
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

  const notePanes = noteWorkspace.state.panes;
  const focusNotePane = noteWorkspace.focusPane;
  const focusPaneAtIndex = useCallback((paneIndex: number) => {
    const pane = notePanes[paneIndex];
    if (!pane) {
      return false;
    }

    focusNotePane(pane.paneId);
    focusZone('editor');
    return true;
  }, [focusNotePane, focusZone, notePanes]);

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
    openQuickOpen,
    refreshWorkspace,
    renameFolder: folderCommands.handleRenameFolder,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
    requestDeleteFolder: folderCommands.handleDeleteFolderRequest,
    reopenLastClosedTab: noteWorkspace.reopenLastClosed,
    saveNote: (note, input) => mutations.updateNoteMutation.mutate({ note, input }),
    saveDraftNote: (tab, input) => mutations.createDraftNoteMutation.mutate({ tabId: tab.tabId, input }),
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
    isSavingNote: mutations.updateNoteMutation.isPending || mutations.createDraftNoteMutation.isPending,
    navigatorCollapsed,
    noteDirty: activeTab && isDraftNoteTab(activeTab) ? true : noteDirty,
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
    focusPaneAtIndex,
    focusTabAtIndex,
    handleCreateNote: folderCommands.handleCreateNote,
    noteDirty,
    openPalette,
    paneCount: noteWorkspace.state.panes.length,
    platform: api?.platform ?? navigator.platform,
    refreshWorkspace,
    runAction,
    selectedFolderId,
    setFinderState,
    setSelectedFolderId,
    shortcuts: settings?.shortcuts,
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
  const workspaceProps = useHomeWorkspaceProps({
    actions: {
      handleCopyNoteLink,
      handleCopyNoteMarkdownLink,
      handleDeleteRequest,
      handleDuplicateNote,
      handleExportMarkdown,
      handleExportNoteMarkdown,
      handleImportMarkdownNote,
      handleNoteSelect,
      handleOpenEditor,
      handleOpenExternal,
      openHackmdTokenSetup,
      openPalette,
      setFinderState,
      setShareOpen,
      switchWorkspaceScope,
    },
    activeFinderState,
    attachImageRequestId,
    collapsedFolderIds,
    displayScope,
    documents: workbenchDocuments,
    editorFocusRequestId,
    editorMode: settings?.editor?.mode ?? defaultSettings.editor.mode,
    editorSearchRequestId,
    folderCommands,
    folderTree,
    getTabSyncState,
    hasConfiguredLocalVault,
    homeStatus,
    inspectorCollapsed,
    localDocumentRecovery,
    localVaultActions,
    mutations,
    navigator: workbenchNavigator,
    navigatorCollapsed,
    navigatorWidth,
    noteWorkspace,
    railCollapsed,
    railWidth,
    refreshWorkspace,
    selectedFolderId,
    selectedNote,
    setNavigatorWidth,
    setRailWidth,
    setSettingsOpen,
    shareOpen,
    tabLifecycle: {
      requestCloseOtherTabs,
      requestCloseTab,
      requestCloseTabsToRight,
    },
    teams,
    toggleInspectorCollapsed,
    toggleNavigatorCollapsed,
    toggleRailCollapsed,
    user,
  });
  const overlayProps = useHomeOverlayProps({
    actionContext,
    api,
    commandPaletteProps,
    commandPaletteTheme: {
      themeMode: theme,
      themePresetId: presetId,
      themePresets: presets,
      onSelectThemeMode: setTheme,
      onSelectThemePreset: setPresetId,
    },
    commandPaletteUtilities: {
      currentNoteIsRemote: Boolean(selectedDocument && selectedDocument.teamPath !== LOCAL_VAULT_TEAM_PATH),
      hasCurrentNote: Boolean(selectedDocument),
      hasHackmdApiToken: settings?.hasHackmdApiToken === true,
      hasLocalVault: hasConfiguredLocalVault,
      onConnectHackmd: openHackmdTokenSetup,
      onCopyCurrentNoteLink: () => {
        if (selectedDocument) {
          handleCopyNoteLink(selectedDocument);
        }
      },
      onCopyCurrentNoteMarkdownLink: () => {
        if (selectedDocument) {
          handleCopyNoteMarkdownLink(selectedDocument);
        }
      },
      onOpenLocalFolder: () => {
        void localVaultActions.chooseLocalVault();
      },
      onShareCurrentNote: () => setShareOpen(true),
      onSwitchLocalVault: () => switchWorkspaceScope({ type: 'local', label: 'Local Vault' }),
    },
    dialogState,
    displayScope,
    localVaultActions,
    localVaultError: localVault.snapshotQuery.error instanceof Error
      ? localVault.snapshotQuery.error.message
      : null,
    localVaultSnapshot: localVault.snapshot,
    mutations,
    onHackmdDisconnected: handleHackmdDisconnected,
    onboardingOpen,
    runAction,
    selectedFolderLabel,
    onOnboardingConnected: handleOnboardingConnected,
    setOnboardingOpen,
    settings,
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
      <ElectronHomeWorkspace {...workspaceProps} />

      <ElectronHomeOverlays {...overlayProps} />
    </div>
  );
}
