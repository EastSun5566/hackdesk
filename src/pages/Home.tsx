import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/components/theme-provider';
import { getDesktopAPI } from '@/lib/desktop-api';
import type { FolderSummary } from '@/lib/electron-api';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { defaultSettings } from '@/lib/settings';

import { ElectronHomeOverlays } from './electron-home/ElectronHomeOverlays';
import { ElectronHomeWorkspace } from './electron-home/ElectronHomeWorkspace';
import { useElectronSettings } from './electron-home/useElectronSettings';
import { useLocalVaultSession } from './electron-home/useLocalVaultSession';
import { LOCAL_VAULT_TEAM_PATH, toDocumentSummary } from './electron-home/local-vault-adapter';
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
import {
  getQuickCaptureDraftError,
  useElectronHomeShellEffects,
  type QuickCaptureDraftResult,
} from './electron-home/useElectronHomeShellEffects';
import { useElectronNoteMutations } from './electron-home/useElectronNoteMutations';
import { useDocumentCommands } from './electron-home/useDocumentCommands';
import { useLocalDocumentRecovery } from './electron-home/useLocalDocumentRecovery';
import { useRemoteDocumentRecovery } from './electron-home/useRemoteDocumentRecovery';
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
import { useWorkspaceBackupNotice } from './electron-home/useWorkspaceBackupNotice';
import { useDraftTextActions } from './electron-home/useDraftTextActions';
import { useTabImageUploads } from './electron-home/useTabImageUploads';
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
import { getSavedTabNoteIdentity, isDraftNoteTab, type OpenNoteTab } from './electron-home/note-workspace';
import {
  DEFAULT_WORKSPACE_SCOPE,
  getInitialWorkspaceScope,
  useWorkbenchWorkspaceState,
} from './electron-home/useWorkbenchWorkspaceState';
import { getWorkspaceNavigationTeams } from './electron-home/workspace-navigation';

export function Home() {
  const { presets, presetId, resolvedMode, setPresetId, setTheme, theme } = useTheme();
  const queryClient = useQueryClient();
  const rawApi = getDesktopAPI();
  const settingsQuery = useElectronSettings(rawApi);
  const beforeVaultChange = useRef<() => void>(() => {});
  const vaultSession = useLocalVaultSession(rawApi, settingsQuery.data, beforeVaultChange);
  const api = vaultSession.api;
  const initialWorkspaceScope = useMemo(() => getInitialWorkspaceScope(), []);
  const { recentNotes, removeRecentNoteEntry, trackRecentNote, syncLocalRecentNotes } = useElectronHomeRecentNotes(window.localStorage, vaultSession.vaultId);
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
    localVaultId: vaultSession.vaultId,
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
  const currentScopeKeyRef = useRef(scopeStorageKey);
  useLayoutEffect(() => { currentScopeKeyRef.current = scopeStorageKey; }, [scopeStorageKey]);
  const flushWorkspace = noteWorkspace.flush;
  useLayoutEffect(() => { beforeVaultChange.current = flushWorkspace; }, [flushWorkspace]);
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
    scopeStorageKey,
    openNoteInWorkspace: noteWorkspace.openNote,
    selectionRefs,
    trackRecentNote,
  });
  const {
    activeFinderState,
    deferredFinderState,
    finderActive,
    focusWorkspaceSearch,
    setFinderState,
  } = useWorkbenchFinder({
    initialScopeStorageKey: workspaceState.initialScopeStorageKey,
    scopeStorageKey,
    selectedFolderId,
    setNavigatorCollapsed,
  });
  const setWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    flushWorkspace();
    setWorkspaceScopeState(nextScope);
  }, [flushWorkspace, setWorkspaceScopeState]);
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
    settingsQuery,
    scope,
    selectedNote,
    activeDocumentNotes,
  });
  const localDocuments = useElectronLocalVault({
    api,
    enabled: !!vaultSession.snapshot && !vaultSession.isChanging && scope.type === 'local',
    snapshot: vaultSession.snapshot,
    selectedNote,
    activeDocumentNotes,
  });
  const localVault = { ...localDocuments, snapshotQuery: vaultSession.snapshotQuery };
  const localVaultActions = useHomeLocalVaultActions({
    api,
    queryClient,
    refetchLocalVault: async () => {
      if (vaultSession.isChanging) throw new Error('Local Vault is still loading. Try again when it is ready.');
      await localVault.snapshotQuery.refetch();
    },
    setWorkspaceScope,
  });
  const currentNotes = scope.type === 'local' ? localVault.currentNotes : remoteNotes;
  const currentFolders = scope.type === 'local' ? localVault.currentFolders : remoteFolders;
  const currentFolderOrder = scope.type === 'local' ? undefined : remoteFolderOrder;
  const documentsByKey = scope.type === 'local' ? localVault.documentsByKey : remoteDocumentsByKey;
  useEffect(() => { syncLocalRecentNotes(localVault.currentNotes); }, [localVault.currentNotes, syncLocalRecentNotes]);
  const documentQueries = scope.type === 'local' ? localVault.documentQueries : remoteDocumentQueries;
  const queries = remoteQueries;
  const isWorkspaceFetching = scope.type === 'local'
    ? localVault.snapshotQuery.isFetching
    : queries.notesQuery.isFetching;
  const isWorkspaceLoading = scope.type === 'local'
    ? vaultSession.isLoading || localVault.snapshotQuery.isError || !!vaultSession.error
    : queries.notesQuery.isLoading;
  const hasConfiguredLocalVault = settings?.hasLocalVault === true;
  const canUseCurrentWorkspace = scope.type === 'local' ? !!vaultSession.snapshot && !vaultSession.isChanging : hasToken;
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
    if (settings?.shouldShowHackmdOnboarding && !settingsOpen && !vaultSession.isChanging) {
      setOnboardingOpen(true);
    }
  }, [
    settings?.shouldShowHackmdOnboarding,
    settingsOpen,
    vaultSession.isChanging,
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
      if (currentScopeKeyRef.current !== scopeStorageKey) {
        noteWorkspace.openNote(note);
        trackRecentNote(note);
        return;
      }
      setCreateDialog({ open: false, title: '' });
      void requestSelectNote(note, { trackRecent: true });
    },
    onDraftNoteCreated: (tabId, note, submittedDraft) => {
      noteWorkspace.materializeDraftNote(tabId, note, submittedDraft);
      noteWorkspace.syncNoteSummary(note);
      trackRecentNote(note);
    },
    onNoteSaved: (note, variables) => {
      if (variables.intent === 'content' && variables.tabId && variables.submittedDraft) {
        noteWorkspace.reconcileSavedNote({
          note,
          tabId: variables.tabId,
          submittedDraft: variables.submittedDraft,
        });
      } else {
        noteWorkspace.syncNoteSummary(note);
      }
      trackRecentNote(note);
    },
    onFolderCreated: (folder: FolderSummary) => {
      if (currentScopeKeyRef.current !== scopeStorageKey) return;
      setCreateFolderDialog(createClosedFolderDialogState());
      if (folder.id) {
        setSelectedFolderId(folder.id);
      }
    },
    onFolderRenamed: (folder: FolderSummary) => {
      if (currentScopeKeyRef.current !== scopeStorageKey) return;
      setRenameFolderDialog(createClosedRenameFolderDialogState());
      if (folder.id) {
        setSelectedFolderId(folder.id);
      }
    },
    onFolderDeleted: (_folderId, parentFolderId) => {
      if (currentScopeKeyRef.current !== scopeStorageKey) return;
      setDeleteFolderTarget(null);
      setSelectedFolderId(parentFolderId ?? UNFILED_FOLDER_ID);
    },
    onNoteDeleted: (note) => {
      removeRecentNoteEntry(note.id, note.teamPath ?? null);
      noteWorkspace.closeByNoteIdentity(note);
      if (currentScopeKeyRef.current === scopeStorageKey) setDeleteTarget(null);
    },
    onNoteMoved: (note, targetFolderId) => {
      noteWorkspace.syncNoteSummary(note);
      if (currentScopeKeyRef.current !== scopeStorageKey) return;
      setSelectedFolderId(targetFolderId ?? UNFILED_FOLDER_ID);
      void requestSelectNote(note, { trackRecent: true });
    },
  });
  const localDocumentRecovery = useLocalDocumentRecovery({
    api,
    clearDraft: noteWorkspace.clearDraft,
    documentQueries: localVault.documentQueries,
    drafts: noteWorkspace.state.drafts,
    enabled: scope.type === 'local' && !!vaultSession.vaultId && !vaultSession.isChanging,
    getTabsMatching: noteWorkspace.getTabsMatching,
    notes: localVault.currentNotes,
    openNote: noteWorkspace.openNote,
    resetSaveMutation: mutations.updateNoteMutation.reset,
    syncNoteSummary: noteWorkspace.syncNoteSummary,
    tabs: noteWorkspace.state.tabs,
    trackRecentNote,
  });
  const remoteDocumentRecovery = useRemoteDocumentRecovery({
    clearDraft: noteWorkspace.clearDraft,
    documentQueries: remoteDocumentQueries,
    getTabsMatching: noteWorkspace.getTabsMatching,
    resetSaveMutation: mutations.updateNoteMutation.reset,
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
    clearDraft: noteWorkspace.clearDraft,
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
    localVaultId: vaultSession.vaultId,
    displayScope,
    expandNavigator,
    focusNavigator: () => focusZone('navigator'),
    handleShowFinderResults,
    isWorkspaceFetching,
    isWorkspaceLoading,
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
    openQuickOpen,
    refreshWorkspace,
    renameFolder: folderCommands.handleRenameFolder,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
    requestDeleteFolder: folderCommands.handleDeleteFolderRequest,
    reopenLastClosedTab: noteWorkspace.reopenLastClosed,
    saveNote: (note, input) => {
      if (!activeTab || isDraftNoteTab(activeTab)) {
        return;
      }
      mutations.updateNoteMutation.mutate({
        note,
        input,
        intent: 'content',
        tabId: activeTab.tabId,
        submittedDraft: { ...noteWorkspace.state.drafts[activeTab.tabId], ...input },
      });
    },
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
    api,
    backupFailed: noteWorkspace.backupFailed,
    closeTransientLayer,
    confirmCloseUnsafeTabs,
    openTabs: noteWorkspace.state.tabs,
  });

  const openQuickCaptureDraft = useCallback((content: string): QuickCaptureDraftResult => {
    if (!content.trim()) {
      return { accepted: false, error: 'Write something before capturing.' };
    }

    const guardError = getQuickCaptureDraftError({
      scopeType: scope.type,
      hasToken,
      hasConfiguredLocalVault,
      isLocalVaultReady: !!vaultSession.vaultId && !vaultSession.isChanging,
    });
    if (guardError) {
      return { accepted: false, error: guardError };
    }

    try {
      noteWorkspace.openRecoverableDraftNote({ content });
    } catch (error) {
      return { accepted: false, error: error instanceof Error ? error.message : 'HackDesk could not save this capture. Your text is still here.' };
    }
    focusZone('editor');
    return { accepted: true };
  }, [
    focusZone,
    hasConfiguredLocalVault,
    hasToken,
    noteWorkspace,
    vaultSession.vaultId,
    vaultSession.isChanging,
    scope.type,
  ]);

  useElectronHomeShellEffects({
    api,
    collapsedFolderIds,
    openQuickCaptureDraft,
    runAction,
    scopeStorageKey,
  });

  const openHackmdTokenSetup = useCallback(() => {
    setOnboardingOpen(true);
  }, [setOnboardingOpen]);

  const workspaceNavigation = useMemo(() => getWorkspaceNavigationTeams(
    teams,
    settings?.workspaceNavigation?.pinnedTeamIds ?? null,
  ), [settings?.workspaceNavigation?.pinnedTeamIds, teams]);
  const switchWorkspaceAtIndex = useCallback((workspaceIndex: number) => {
    if (workspaceIndex === 0) {
      switchWorkspaceScope({ type: 'personal', label: 'My Workspace' });
      return true;
    }

    const team = workspaceNavigation.pinnedTeams[workspaceIndex - 1];
    if (!team || workspaceIndex > 8) {
      return false;
    }

    switchWorkspaceScope({ type: 'team', label: team.name, teamPath: team.path });
    return true;
  }, [switchWorkspaceScope, workspaceNavigation.pinnedTeams]);

  useWorkbenchShortcuts({
    activeFinderState,
    closeTransientLayer,
    handleCreateNote: folderCommands.handleCreateNote,
    noteDirty,
    openPalette,
    platform: api?.platform ?? navigator.platform,
    refreshWorkspace,
    runAction,
    selectedFolderId,
    setFinderState,
    setSelectedFolderId,
    shortcuts: settings?.shortcuts,
    switchWorkspaceAtIndex,
  });

  const backupNotice = useWorkspaceBackupNotice({ api, workspace: noteWorkspace });
  const { copyDraftText, exportDraftText } = useDraftTextActions(api);
  const readBackgroundTabDocument = useCallback(async (originScopeKey: string, tab: OpenNoteTab) => {
    const identity = getSavedTabNoteIdentity(tab);
    if (!api || !identity) return undefined;
    if (identity.teamPath === LOCAL_VAULT_TEAM_PATH) {
      // Only the active vault can be read; never read a same-named note from another vault.
      const snapshot = await api.localVault.getSnapshot();
      if (!snapshot || originScopeKey !== `local:${snapshot.vaultId}`) return undefined;
      return toDocumentSummary(await api.localVault.readNote(identity.id), snapshot);
    }
    const result = await api.hackmd.getNote(identity.id, identity.teamPath);
    return result.source === 'error' ? undefined : result.data;
  }, [api]);
  const attachImageToTab = useTabImageUploads({
    scopeKey: noteWorkspace.state.scopeKey,
    getTabDocument: workbenchDocuments.getTabDocument,
    getWorkspaceSnapshot: noteWorkspace.getWorkspaceSnapshot,
    replaceTabPlaceholder: noteWorkspace.replaceTabPlaceholder,
    readTabDocument: readBackgroundTabDocument,
    uploadImage: (note, input) => mutations.uploadNoteImageMutation.mutateAsync({ note, input }),
  });
  const retryDocumentLoad = useCallback((tab: OpenNoteTab) => {
    const identity = getSavedTabNoteIdentity(tab);
    if (!identity) return;
    void Promise.resolve(documentQueries.refetchByIdentity(identity)).catch(() => undefined);
  }, [documentQueries]);
  const homeStatus = useElectronHomeStatus({
    isLocalVaultLoading: vaultSession.isLoading,
    isLocalVaultFetching: vaultSession.snapshotQuery.isFetching || vaultSession.isChanging,
    canCreate,
    finderActive,
    hasLocalVault: hasConfiguredLocalVault,
    hasToken: canUseCurrentWorkspace,
    localVaultError: vaultSession.error ?? (localVault.snapshotQuery.error instanceof Error
      ? localVault.snapshotQuery.error.message
      : null),
    localVaultSkippedFiles: vaultSession.snapshot?.skippedFiles,
    mutations,
    queries,
    scope,
    selectedFolder,
  });
  const workspaceProps = useHomeWorkspaceProps({
    actions: {
      attachImageToTab,
      copyDraftText,
      exportDraftText,
      retryDocumentLoad,
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
    remoteDocumentRecovery,
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
    settings,
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
    localVaultError: vaultSession.error ?? (localVault.snapshotQuery.error instanceof Error
      ? localVault.snapshotQuery.error.message
      : null),
    localVaultSnapshot: localVault.snapshot,
    mutations,
    onHackmdDisconnected: handleHackmdDisconnected,
    onboardingOpen,
    runAction,
    selectedFolderLabel,
    onOnboardingConnected: handleOnboardingConnected,
    setOnboardingOpen,
    settings,
    user,
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
      <ElectronHomeWorkspace {...workspaceProps} backupNotice={backupNotice} />

      <ElectronHomeOverlays {...overlayProps} />
    </div>
  );
}
