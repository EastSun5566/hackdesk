import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';

import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { readComparisonSource } from './read-comparison-source';
import type { NoteFinderState } from '@/lib/electron-note-finder';
import type {
  DocumentSummary,
  HackDeskElectronAPI,
  ElectronSafeSettings,
  NewWindowWorkspaceScope,
  NoteSummary,
  TeamSummary,
  UserSummary,
} from '@/lib/electron-api';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';
import { defaultSettings, getActiveLocalVaultPath, getActiveLocalWorkspace, getLocalWorkspaces } from '@/lib/settings';
import { localVaultFolderName } from './workspace-root-labels';
import { toast } from '@/components/ui/toast';

import type { ElectronHomeWorkspaceProps } from './ElectronHomeWorkspace';
import type { HomeLocalVaultActions } from './useHomeLocalVaultActions';
import type { EditorRequest } from './useWorkbenchEditorRequests';
import type { WorkspaceScope } from './types';
import { isDraftNoteTab, type OpenNoteTab } from './note-workspace';
import type { useElectronHomeStatus } from './useElectronHomeStatus';
import type { useElectronNoteMutations } from './useElectronNoteMutations';
import type { useLocalDocumentRecovery } from './useLocalDocumentRecovery';
import type { useRemoteDocumentRecovery } from './useRemoteDocumentRecovery';
import type { useNoteWorkspaceTabs } from './useNoteWorkspaceTabs';
import type { useWorkbenchDocuments } from './useWorkbenchDocuments';
import type { useWorkbenchFolderCommands } from './useWorkbenchFolderCommands';
import type { useWorkbenchNavigator } from './useWorkbenchNavigator';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';

import type { OpenNoteTarget } from './useNoteLinkOpener';
import type { WorkspaceFolderTree } from './FolderNavigator';

const EMPTY_WORKSPACE_FOLDERS: WorkspaceFolderTree[] = [];

type WorkspaceNavigationTarget =
  | { kind: 'root'; vaultId: string; action?: 'create-note' | 'create-folder' }
  | { kind: 'folder'; vaultId: string; folderIds: string[]; action?: 'create-note' | 'create-folder' | 'rename' | 'move' | 'edit' | 'delete' | 'reveal'; name?: string }
  | { kind: 'note'; vaultId: string; noteId: string };
type PendingWorkspaceNavigation = WorkspaceNavigationTarget & { originSnapshotId: string | null };

type HomeStatus = ReturnType<typeof useElectronHomeStatus>;
type NoteMutations = ReturnType<typeof useElectronNoteMutations>;
type NoteWorkspace = ReturnType<typeof useNoteWorkspaceTabs>;
type WorkbenchDocuments = ReturnType<typeof useWorkbenchDocuments>;
type WorkbenchFolderCommands = ReturnType<typeof useWorkbenchFolderCommands>;
type WorkbenchNavigator = ReturnType<typeof useWorkbenchNavigator>;
type LocalDocumentRecovery = ReturnType<typeof useLocalDocumentRecovery>;
type RemoteDocumentRecovery = ReturnType<typeof useRemoteDocumentRecovery>;

type WorkspaceActions = {
  saveDraftNote: (tab: OpenNoteTab, input: { title?: string; content?: string }) => void;
  /** Zooms or restores the active pane, saying how to restore it. */
  togglePaneZoom: () => void;
  attachImageToTab: ElectronHomeWorkspaceProps['documentWorkspace']['onAttachImage'];
  cancelImageUpload?: ElectronHomeWorkspaceProps['documentWorkspace']['onCancelImageUpload'];
  copyDraftText: ElectronHomeWorkspaceProps['documentWorkspace']['onCopyDraft'];
  exportDraftText: ElectronHomeWorkspaceProps['documentWorkspace']['onExportDraft'];
  retryDocumentLoad: ElectronHomeWorkspaceProps['documentWorkspace']['onRetryLoad'];
  handleCopyNoteLink: ElectronHomeWorkspaceProps['navigator']['actions']['onCopyNoteLink'];
  handleCopyNoteMarkdownLink: ElectronHomeWorkspaceProps['navigator']['actions']['onCopyNoteMarkdownLink'];
  handleDeleteRequest: ElectronHomeWorkspaceProps['navigator']['actions']['onDeleteNote'];
  handleDuplicateNote: ElectronHomeWorkspaceProps['navigator']['actions']['onDuplicateNote'];
  handleExportMarkdown: ElectronHomeWorkspaceProps['documentWorkspace']['onExportMarkdown'];
  handleExportNoteMarkdown: ElectronHomeWorkspaceProps['navigator']['actions']['onExportNoteMarkdown'];
  handleImportMarkdownNote: ElectronHomeWorkspaceProps['navigator']['actions']['onImportMarkdown'];
  handleCreateNoteFromTemplate: () => void;
  handleHackmdDisconnected: () => void;
  handleNoteSelect: ElectronHomeWorkspaceProps['navigator']['actions']['onNoteSelect'];
  handleNoteKeep: NonNullable<ElectronHomeWorkspaceProps['navigator']['actions']['onNoteKeep']>;
  handleOpenEditor: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenNote'];
  handleOpenExternal: ElectronHomeWorkspaceProps['documentWorkspace']['onOpenExternal'];
  openHackmdTokenSetup: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenSettings'];
  openPalette: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenPalette'];
  openQuickOpen: () => void;
  setFinderState: Dispatch<SetStateAction<NoteFinderState>>;
  setShareOpen: (open: boolean) => void;
  setTrashOpen: (open: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
  setVersionsOpen: (open: boolean) => void;
  switchWorkspaceScope: (scope: WorkspaceScope) => void;
  openTrashNote: (note: NoteSummary) => void;
  renameNoteInline: (note: NoteSummary, name: string) => void;
  moveNoteRequest: (note: NoteSummary) => void;
  moveFolderRequest: (folderId: string) => void;
  chooseNewNoteLocation: (folderId: string | null) => void;
};

export function useHomeWorkspaceProps({
  api,
  openNoteTarget,
  revealFolder,
  saveAsTemplate,
  localVaultId,
  actions,
  activeFinderState,
  collapsedFolderIds,
  displayScope,
  documents,
  editorRequests,
  consumeEditorRequest,
  editorMode,
  folderCommands,
  folderTree,
  getTabSyncState,
  homeStatus,
  inspectorCollapsed,
  localDocumentRecovery,
  localVaultActions,
  mutations,
  navigator,
  navigatorCollapsed,
  navigatorWidth,
  noteWorkspace,
  refreshWorkspace,
  remoteDocumentRecovery,
  selectedFolderId,
  selectedNote,
  setNavigatorWidth,
  setSettingsOpen,
  settings,
  shareOpen,
  versionsOpen,
  tabLifecycle,
  teams,
  toggleInspectorCollapsed,
  toggleNavigatorCollapsed,
  user,
  uploadingTabIds = [],
  workspaceSwitcherOpen,
  setWorkspaceSwitcherOpen,
  onNewTab,
  recentNotes,
  trashOpen,
  historyOpen,
  workspaceFolders = EMPTY_WORKSPACE_FOLDERS,
}: {
  api?: HackDeskElectronAPI;
  openNoteTarget?: OpenNoteTarget;
  /** Shows a folder in the sidebar and focuses it; no IDs means the workspace root. */
  revealFolder?: (folderIds: string[]) => void;
  /** Copies the active note into the Templates folder. */
  saveAsTemplate?: () => void;
  localVaultId?: string | null;
  actions: WorkspaceActions;
  activeFinderState: NoteFinderState;
  collapsedFolderIds: Set<string>;
  displayScope: WorkspaceScope;
  documents: WorkbenchDocuments;
  editorRequests: EditorRequest[];
  consumeEditorRequest: (id: number) => void;
  editorMode: ElectronHomeWorkspaceProps['documentWorkspace']['editorMode'];
  folderCommands: WorkbenchFolderCommands;
  folderTree: FolderTree;
  getTabSyncState: ElectronHomeWorkspaceProps['titlebar']['getTabSyncState'];
  homeStatus: HomeStatus;
  inspectorCollapsed: boolean;
  localDocumentRecovery: LocalDocumentRecovery;
  localVaultActions: HomeLocalVaultActions;
  mutations: NoteMutations;
  navigator: WorkbenchNavigator;
  navigatorCollapsed: boolean;
  navigatorWidth: number;
  noteWorkspace: NoteWorkspace;
  refreshWorkspace: () => void;
  remoteDocumentRecovery: RemoteDocumentRecovery;
  selectedFolderId: string | null;
  selectedNote: { id: string } | null;
  setNavigatorWidth: (width: number) => void;
  setSettingsOpen: (open: boolean) => void;
  settings: ElectronSafeSettings | undefined;
  shareOpen: boolean;
  versionsOpen: boolean;
  tabLifecycle: Pick<
    ElectronHomeWorkspaceProps['titlebar']['actions'],
    'requestCloseOtherTabs' | 'requestCloseTab' | 'requestCloseTabsToRight'
  >;
  teams: TeamSummary[];
  toggleInspectorCollapsed: () => void;
  toggleNavigatorCollapsed: () => void;
  user: UserSummary | undefined;
  uploadingTabIds?: readonly string[];
  workspaceSwitcherOpen: boolean;
  setWorkspaceSwitcherOpen: (open: boolean) => void;
  onNewTab: () => void;
  recentNotes: ElectronRecentNote[];
  trashOpen: boolean;
  historyOpen: boolean;
  /** Every folder of the open named set, in its stored order. */
  workspaceFolders?: WorkspaceFolderTree[];
}): ElectronHomeWorkspaceProps {
  const localVaultPathName = (() => {
    const activePath = settings ? getActiveLocalVaultPath(settings) : null;
    return activePath ? localVaultFolderName(activePath) : null;
  })();
  const activeLocalWorkspace = getActiveLocalWorkspace(settings);
  const localWorkspaceName = activeLocalWorkspace && settings?.localVault.activeVaultId
    && activeLocalWorkspace.vaultIds.includes(settings.localVault.activeVaultId)
    ? activeLocalWorkspace.name
    : null;
  const activeVaultId = settings?.localVault.activeVaultId ?? null;
  // Opening a row in another folder's tree opens that folder of the set (a focus change: tabs and
  // search stay), then moves the tree selection once its snapshot is on screen. The snapshot id
  // proves the tree now belongs to the folder.
  const pendingWorkspaceNavigation = useRef<PendingWorkspaceNavigation | null>(null);
  const pendingSwitcherFolder = useRef<{ workspaceId: string; vaultId: string } | null>(null);
  const switchingWorkspaceFolder = useRef(false);
  useEffect(() => {
    const pending = pendingWorkspaceNavigation.current;
    if (!pending) return;
    if (activeVaultId !== pending.vaultId) return;
    if (!localVaultId || localVaultId === pending.originSnapshotId) return;
    if (pending.kind === 'root') {
      pendingWorkspaceNavigation.current = null;
      if (pending.action === 'create-note') actions.chooseNewNoteLocation(null);
      else if (pending.action === 'create-folder') folderCommands.handleCreateFolderInside(null);
      return;
    }
    if (pending.kind === 'note') {
      const entry = folderTree.allNotes.find((candidate) => candidate.note.id === pending.noteId);
      if (!entry) return;
      pendingWorkspaceNavigation.current = null;
      // The note is already open; only show where it lives.
      const folderIds = entry.folderPath.map((folder) => folder.id);
      navigator.revealFolderIds(folderIds);
      navigator.handleFolderSelect(folderIds.at(-1) ?? UNFILED_FOLDER_ID);
      return;
    }
    const leafFolderId = pending.folderIds.at(-1);
    if (!leafFolderId || !folderTree.nodesById.has(leafFolderId)) return;
    pendingWorkspaceNavigation.current = null;
    navigator.revealFolderIds(pending.folderIds);
    navigator.handleFolderSelect(leafFolderId);
    if (pending.action === 'create-note') actions.chooseNewNoteLocation(leafFolderId);
    else if (pending.action === 'create-folder') folderCommands.handleCreateFolderInside(leafFolderId);
    else if (pending.action === 'rename' && pending.name) mutations.renameFolderMutation.mutate({ folderId: leafFolderId, input: { name: pending.name } });
    else if (pending.action === 'move') actions.moveFolderRequest(leafFolderId);
    else if (pending.action === 'edit') folderCommands.handleRenameFolder(leafFolderId);
    else if (pending.action === 'delete') folderCommands.handleDeleteFolderRequest(leafFolderId);
    else if (pending.action === 'reveal') localVaultActions.revealLocalFolder(leafFolderId);
  }, [activeVaultId, folderTree, localVaultId, navigator, actions, folderCommands, mutations.renameFolderMutation, localVaultActions]);

  // Clicks in other folders while one is opening only replace the target: the last click wins,
  // instead of a second switch failing because the first is still running.
  const requestWorkspaceFolder = (target: WorkspaceNavigationTarget) => {
    pendingWorkspaceNavigation.current = { ...target, originSnapshotId: localVaultId ?? null } as PendingWorkspaceNavigation;
    if (switchingWorkspaceFolder.current) return;
    switchingWorkspaceFolder.current = true;
    void (async () => {
      let current = activeVaultId;
      try {
        while (pendingWorkspaceNavigation.current && pendingWorkspaceNavigation.current.vaultId !== current) {
          const next = pendingWorkspaceNavigation.current.vaultId;
          await localVaultActions.switchLocalVault(next);
          current = next;
        }
      } catch (error) {
        pendingWorkspaceNavigation.current = null;
        toast.error(error instanceof Error ? error.message : 'Failed to open that folder.');
      } finally {
        switchingWorkspaceFolder.current = false;
      }
    })();
  };

  const openWorkspaceFolder = (vaultId: string, folderIds: string[]) => {
    if (vaultId === activeVaultId && !switchingWorkspaceFolder.current) {
      navigator.revealFolderIds(folderIds);
      const leafFolderId = folderIds.at(-1);
      if (leafFolderId) navigator.handleFolderSelect(leafFolderId);
      return;
    }
    requestWorkspaceFolder(folderIds.length ? { kind: 'folder', vaultId, folderIds } : { kind: 'root', vaultId });
  };

  useEffect(() => {
    const pending = pendingSwitcherFolder.current;
    if (!pending || displayScope.type !== 'local' || activeLocalWorkspace?.id !== pending.workspaceId || !localVaultId) return;
    pendingSwitcherFolder.current = null;
    if (pending.vaultId !== activeVaultId) requestWorkspaceFolder({ kind: 'root', vaultId: pending.vaultId });
  });

  const openWorkspaceNote = (vaultId: string, note: NoteSummary) => {
    if (vaultId === activeVaultId && !switchingWorkspaceFolder.current) {
      const entry = folderTree.allNotes.find((candidate) => candidate.note.id === note.id);
      if (entry) void navigator.revealNoteEntry(entry);
      return;
    }
    // Every folder of the set can be read, so the note opens now, in the set's tabs; its folder
    // opens in the sidebar alongside.
    actions.handleNoteSelect(note);
    requestWorkspaceFolder({ kind: 'note', vaultId, noteId: note.id });
  };

  const reorderWorkspaceFolders = (vaultIds: string[]) => {
    if (!activeLocalWorkspace) return;
    void localVaultActions.reorderLocalWorkspaceFolders(activeLocalWorkspace.id, vaultIds).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to reorder folders.');
    });
  };

  return {
    titlebar: {
      getPaneTabs: documents.getPaneTabs,
      getPaneView: documents.getPaneView,
      getTabSyncState,
      layout: {
        navigatorCollapsed,
      },
      state: {
        scopeKey: noteWorkspace.state.scopeKey,
        activePaneId: noteWorkspace.state.activePaneId,
        backStack: noteWorkspace.state.backStack,
        forwardStack: noteWorkspace.state.forwardStack,
        panes: noteWorkspace.state.panes,
        recentlyClosedTabs: noteWorkspace.state.recentlyClosedTabs,
        zoomedPaneId: noteWorkspace.state.zoomedPaneId,
      },
      actions: {
        moveActiveTabToOtherPane: noteWorkspace.moveActiveTabToOtherPane,
        navigateBack: noteWorkspace.navigateBack,
        navigateForward: noteWorkspace.navigateForward,
        reopenLastClosedTab: noteWorkspace.reopenLastClosed,
        requestCloseOtherTabs: tabLifecycle.requestCloseOtherTabs,
        requestCloseTab: tabLifecycle.requestCloseTab,
        requestCloseTabsToRight: tabLifecycle.requestCloseTabsToRight,
        selectTab: noteWorkspace.selectTab,
        keepTab: noteWorkspace.keepTab,
        reorderTab: noteWorkspace.reorderTab,
        splitActiveTab: noteWorkspace.splitActiveTab,
        splitActivePaneDown: noteWorkspace.splitActivePaneDown,
        togglePaneZoom: actions.togglePaneZoom,
        equalizePanes: noteWorkspace.equalizePanes,
        toggleNavigator: toggleNavigatorCollapsed,
        onNewTab,
      },
    },
    navigator: {
      scope: displayScope,
      tree: folderTree,
      vaultFolderName: localVaultPathName,
      localWorkspaceName,
      workspaceFolders,
      workspace: {
        scope: displayScope,
        user,
        teams,
        platform: window.hackdeskAPI?.platform ?? window.navigator.platform,
        pinnedTeamIds: settings?.workspaceNavigation?.pinnedTeamIds ?? null,
        accountStatus: homeStatus.accountStatus,
        switcherOpen: workspaceSwitcherOpen,
        onSwitcherOpenChange: setWorkspaceSwitcherOpen,
        onChooseLocalVault: () => {
          void localVaultActions.chooseLocalVault();
        },
        onScopeChange: (next) => {
          actions.setTrashOpen(false);
          actions.setHistoryOpen(false);
          actions.switchWorkspaceScope(next);
        },
        localVaults: settings?.localVault.vaults ?? [],
        localWorkspaces: getLocalWorkspaces(settings).map(({ id, name, vaultIds }) => ({ id, name, vaultIds })),
        activeLocalVaultId: settings?.localVault.activeVaultId ?? null,
        activeLocalWorkspaceId: settings?.localVault.activeWorkspaceId ?? null,
        onActivateLocalWorkspace: (workspaceId: string | null) => {
          setWorkspaceSwitcherOpen(false);
          void localVaultActions.activateLocalWorkspace(workspaceId).catch((error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to open the local workspace.');
          });
        },
        onOpenLocalWorkspaceFolder: (workspaceId, vaultId) => {
          setWorkspaceSwitcherOpen(false);
          if (activeLocalWorkspace?.id === workspaceId && displayScope.type === 'local') {
            openWorkspaceFolder(vaultId, []);
            return;
          }
          pendingSwitcherFolder.current = { workspaceId, vaultId };
          void localVaultActions.activateLocalWorkspace(workspaceId).catch((error) => {
            pendingSwitcherFolder.current = null;
            toast.error(error instanceof Error ? error.message : 'Failed to open the local workspace.');
          });
        },
        onOpenStandaloneLocalVault: (vaultId) => {
          setWorkspaceSwitcherOpen(false);
          void localVaultActions.openStandaloneLocalVault(vaultId).catch((error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to open the local folder.');
          });
        },
        onSwitchLocalVault: (vaultId: string) => {
          setWorkspaceSwitcherOpen(false);
          void localVaultActions.switchLocalVault(vaultId).catch((error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to switch local vault.');
          });
        },
        onOpenInNewWindow: api?.app.newWindow ? (scope: WorkspaceScope) => {
          setWorkspaceSwitcherOpen(false);
          const workspace: NewWindowWorkspaceScope = scope.type === 'team'
            ? { type: scope.type, label: scope.label, teamPath: scope.teamPath }
            : scope.type === 'local'
              ? { type: scope.type, label: scope.label, vaultId: scope.vaultId }
              : { type: scope.type, label: scope.label };
          void api?.app.newWindow?.({ workspace }).catch((error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to open a new window.');
          });
        } : undefined,
        onOpenSettings: () => setSettingsOpen(true),
        onSignOut: settings?.hasHackmdApiToken
          ? () => mutations.disconnectHackmdMutation.mutate(undefined, { onSuccess: actions.handleHackmdDisconnected })
          : undefined,
        onPinnedTeamIdsChange: (pinnedTeamIds) => {
          mutations.updateSettingsMutation.mutate({
            title: settings?.title ?? defaultSettings.title,
            workspaceNavigation: { pinnedTeamIds },
          });
        },
      },
      entries: navigator.visibleEntries,
      textSearch: navigator.textSearch,
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
      trash: settings?.hasHackmdApiToken && (displayScope.type === 'personal' || displayScope.type === 'team') ? {
        open: trashOpen,
        onOpenChange: (open) => { if (open) actions.setHistoryOpen(false); actions.setTrashOpen(open); },
        onOpenNote: actions.openTrashNote,
        scope: displayScope,
      } : undefined,
      history: { open: historyOpen, onOpenChange: (open) => { if (open) actions.setTrashOpen(false); actions.setHistoryOpen(open); } },
      actions: {
        onFolderSelect: navigator.handleFolderSelect,
        onFolderToggle: navigator.toggleFolderCollapsed,
        onExpandAllFolders: navigator.expandAllFolders,
        onCollapseAllFolders: navigator.collapseAllFolders,
        onFolderRevealInFinder: localVaultActions.revealLocalFolder,
        // Opening a note from the sidebar makes its folder the selection, so the tree highlights
        // one row (the note) and new notes go beside it.
        onNoteKeep: actions.handleNoteKeep,
        onNoteSelect: (note) => {
          const entry = folderTree.allNotes.find((candidate) => candidate.note.id === note.id);
          if (entry) navigator.handleFolderSelect(entry.folderPath.at(-1)?.id ?? UNFILED_FOLDER_ID);
          actions.handleNoteSelect(note);
        },
        onNoteRevealInFinder: localVaultActions.revealLocalNote,
        onFinderStateChange: actions.setFinderState,
        onRefresh: refreshWorkspace,
        onCreate: () => actions.chooseNewNoteLocation(selectedFolderId),
        onCreateFolder: folderCommands.handleCreateFolder,
        onCreateFolderInside: folderCommands.handleCreateFolderInside,
        onCreateNoteInside: actions.chooseNewNoteLocation,
        onChooseLocalVault: () => {
          void localVaultActions.chooseLocalVault();
        },
        onRenameFolder: folderCommands.handleRenameFolder,
        onRenameNoteInline: actions.renameNoteInline,
        onRenameFolderInline: (folderId, name) => mutations.renameFolderMutation.mutate({ folderId, input: { name } }),
        onMoveNoteRequest: actions.moveNoteRequest,
        onMoveFolderRequest: actions.moveFolderRequest,
        onDeleteFolder: folderCommands.handleDeleteFolderRequest,
        onFolderDrop: folderCommands.handleFolderDrop,
        onNoteMove: navigator.handleNoteMove,
        onOpenNote: actions.handleOpenEditor,
        onOpenWorkspaceFolder: openWorkspaceFolder,
        onWorkspaceFolderAction: (vaultId, folderIds, action, name) => {
          if (!folderIds.length && (action === 'create-note' || action === 'create-folder')) requestWorkspaceFolder({ kind: 'root', vaultId, action });
          else requestWorkspaceFolder({ kind: 'folder', vaultId, folderIds, action, name });
        },
        onOpenWorkspaceNote: openWorkspaceNote,
        onReorderWorkspaceFolders: reorderWorkspaceFolders,
        onRevealNoteFolder: (entry: FolderTreeNote) => {
          void navigator.revealNoteEntry(entry);
        },
        onCopyNoteLink: actions.handleCopyNoteLink,
        onCopyNoteMarkdownLink: actions.handleCopyNoteMarkdownLink,
        onDuplicateNote: actions.handleDuplicateNote,
        onExportNoteMarkdown: actions.handleExportNoteMarkdown,
        onDeleteNote: actions.handleDeleteRequest,
        onImportMarkdown: actions.handleImportMarkdownNote,
        onCreateFromTemplate: actions.handleCreateNoteFromTemplate,
        onOpenPalette: actions.openPalette,
        onOpenSettings: actions.openHackmdTokenSetup,
      },
    },
    navigatorResize: {
      disabled: navigatorCollapsed,
      value: navigatorWidth,
      onChange: setNavigatorWidth,
    },
    documentWorkspace: {
      panes: noteWorkspace.state.panes,
      layout: noteWorkspace.state.layout,
      zoomedPaneId: noteWorkspace.state.zoomedPaneId,
      activePaneId: noteWorkspace.state.activePaneId,
      scopeKey: noteWorkspace.state.scopeKey,
      editorRequests,
      onEditorRequestHandled: consumeEditorRequest,
      editorMode,
      folderTree,
      shareOpen,
      versionsOpen,
      isInspectorCollapsed: inspectorCollapsed,
      getPaneView: (pane) => {
        const view = documents.getPaneView(pane);
        return {
          ...view,
          isUploadingImage: view.isUploadingImage || (!!view.activeTab && uploadingTabIds.includes(view.activeTab.tabId)),
        };
      },
      onResizeSplit: noteWorkspace.resizeSplit,
      onTogglePaneZoom: actions.togglePaneZoom,
      onFocusPane: noteWorkspace.focusPane,
      onOpenEditor: actions.handleOpenEditor,
      onOpenExternal: actions.handleOpenExternal,
      onOpenNoteTarget: openNoteTarget,
      onRevealFolder: revealFolder,
      onSaveAsTemplate: saveAsTemplate,
      onPresent: api?.app.openPresentation && ((deck) => void api.app.openPresentation?.(deck)),
      onRevealInFinder: localVaultActions.revealLocalNote,
      canCreateNote: homeStatus.navigatorStatus.canCreate,
      onCreateNote: folderCommands.handleCreateNote,
      onQuickOpen: actions.openQuickOpen,
      recentNotes,
      onCopyLink: actions.handleCopyNoteLink,
      onCopyMarkdownLink: actions.handleCopyNoteMarkdownLink,
      onExportMarkdown: actions.handleExportMarkdown,
      onReadComparison: (document, signal) => readComparisonSource(api, document, signal, localVaultId),
      onReloadFromDisk: localDocumentRecovery.reloadFromDisk,
      onReloadFromHackmd: remoteDocumentRecovery.reloadFromHackmd,
      onSave: (tab, input, options) => {
        if (isDraftNoteTab(tab)) {
          actions.saveDraftNote(tab, input);
          return;
        }

        const document = documents.getTabDocument(tab);
        if (document) {
          mutations.updateNoteMutation.mutate({
            note: document,
            input,
            intent: 'content',
            tabId: tab.tabId,
            successMessage: options?.successMessage,
            submittedDraft: {
              ...noteWorkspace.state.drafts[tab.tabId],
              title: input.title ?? document.title,
              content: input.content ?? document.content ?? '',
            },
          });
        }
      },
      onSaveAsCopy: localDocumentRecovery.saveAsCopy,
      onSaveMetadata: (note: DocumentSummary, input) => mutations.updateNoteMutation.mutate({ note, input, intent: 'metadata' }),
      onSaveSharing: (note: DocumentSummary, input) => mutations.updateNoteMutation.mutate({
        note,
        input,
        intent: 'sharing',
        successMessage: 'Sharing settings updated.',
      }),
      onAttachImage: actions.attachImageToTab,
      onCancelImageUpload: actions.cancelImageUpload,
      onDelete: actions.handleDeleteRequest,
      onTitleChange: documents.handleDocumentTitleChange,
      onContentChange: documents.handleDocumentContentChange,
      onToggleInspector: toggleInspectorCollapsed,
      onCopyDraft: actions.copyDraftText,
      onExportDraft: actions.exportDraftText,
      // A new draft never reuses the original note's identity.
      onOpenAsNewDraft: (title, content, paneId) => noteWorkspace.openDraftNote({ title, content, paneId }),
      onRetryLoad: actions.retryDocumentLoad,
      onShareOpenChange: actions.setShareOpen,
      onVersionsOpenChange: actions.setVersionsOpen,
    },
  };
}
