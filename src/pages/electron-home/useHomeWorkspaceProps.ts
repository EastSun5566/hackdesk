import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useState } from 'react';

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
import type { WorkbenchDocumentActions } from './DocumentActionsContext';
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
import type { OverlayControls } from './workbench-overlays';
import { createFolderSwitchStore, type FolderSwitchTarget } from './workspace-folder-switch';

const EMPTY_WORKSPACE_FOLDERS: WorkspaceFolderTree[] = [];
const NO_LOCAL_VAULTS: ElectronHomeWorkspaceProps['workspaceNavigation']['localVaults'] = [];

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
  /** Zooms or restores the target pane (defaulting to active pane), saying how to restore it. */
  togglePaneZoom: (paneId?: string) => void;
  attachImageToTab: WorkbenchDocumentActions['onAttachImage'];
  cancelImageUpload?: WorkbenchDocumentActions['onCancelImageUpload'];
  copyDraftText: WorkbenchDocumentActions['onCopyDraft'];
  exportDraftText: WorkbenchDocumentActions['onExportDraft'];
  retryDocumentLoad: WorkbenchDocumentActions['onRetryLoad'];
  handleCopyNoteContent: NonNullable<ElectronHomeWorkspaceProps['navigator']['actions']['onCopyNoteContent']>;
  handleCopyNoteLink: ElectronHomeWorkspaceProps['navigator']['actions']['onCopyNoteLink'];
  handleCopyNoteMarkdownLink: ElectronHomeWorkspaceProps['navigator']['actions']['onCopyNoteMarkdownLink'];
  handleDeleteRequest: ElectronHomeWorkspaceProps['navigator']['actions']['onDeleteNote'];
  handleDuplicateNote: ElectronHomeWorkspaceProps['navigator']['actions']['onDuplicateNote'];
  handleExportMarkdown: WorkbenchDocumentActions['onExportMarkdown'];
  handleExportNoteMarkdown: ElectronHomeWorkspaceProps['navigator']['actions']['onExportNoteMarkdown'];
  handleImportMarkdownNote: ElectronHomeWorkspaceProps['navigator']['actions']['onImportMarkdown'];
  handleCreateNoteFromTemplate: () => void;
  handleHackmdDisconnected: () => void;
  handleNoteSelect: ElectronHomeWorkspaceProps['navigator']['actions']['onNoteSelect'];
  handleNoteKeep: NonNullable<ElectronHomeWorkspaceProps['navigator']['actions']['onNoteKeep']>;
  handleOpenEditor: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenNote'];
  handleOpenExternal: WorkbenchDocumentActions['onOpenExternal'];
  openHackmdTokenSetup: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenSettings'];
  openVaultSettings: () => void;
  openPalette: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenPalette'];
  openQuickOpen: () => void;
  setFinderState: Dispatch<SetStateAction<NoteFinderState>>;
  switchWorkspaceScope: (scope: WorkspaceScope) => void;
  openTrashNote: (note: NoteSummary) => void;
  renameNoteInline: (note: NoteSummary, name: string) => void;
  moveNoteRequest: (note: NoteSummary) => void;
  moveFolderRequest: (folderId: string) => void;
  chooseNewNoteLocation: (folderId: string | null) => void;
};

type SwitcherLocalFolders = Pick<ElectronHomeWorkspaceProps['workspaceNavigation'], 'localVaults' | 'localWorkspaces'>;

/**
 * The local folders and workspaces the switcher lists. They keep their identity while the settings
 * do: new arrays on every render would re-render the sidebar, which skips renders on purpose, on
 * each keystroke in the editor.
 */
export function useSwitcherLocalFolders(localVault: ElectronSafeSettings['localVault'] | undefined): SwitcherLocalFolders {
  return useMemo(() => ({
    localVaults: localVault?.vaults ?? NO_LOCAL_VAULTS,
    localWorkspaces: getLocalWorkspaces({ localVault }).map(({ id, name, vaultIds }) => ({ id, name, vaultIds })),
  }), [localVault]);
}

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
  isPaneInspectorCollapsed,
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
  settings,
  tabLifecycle,
  teams,
  toggleInspectorCollapsed,
  toggleNavigatorCollapsed,
  user,
  uploadingTabIds = [],
  overlayControls,
  onNewTab,
  recentNotes,
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
  isPaneInspectorCollapsed?: (paneId: string) => boolean;
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
  settings: ElectronSafeSettings | undefined;
  tabLifecycle: Pick<
    ElectronHomeWorkspaceProps['titlebar']['actions'],
    'requestCloseOtherTabs' | 'requestCloseTab' | 'requestCloseTabsToRight'
  >;
  teams: TeamSummary[];
  toggleInspectorCollapsed: (paneId?: string) => void;
  toggleNavigatorCollapsed: () => void;
  user: UserSummary | undefined;
  uploadingTabIds?: readonly string[];
  overlayControls: OverlayControls;
  onNewTab: (paneId?: string) => void;
  recentNotes: ElectronRecentNote[];
  /** Every folder of the open named set, in its stored order. */
  workspaceFolders?: WorkspaceFolderTree[];
}): ElectronHomeWorkspaceProps {
  const localVaultPathName = (() => {
    const activePath = settings ? getActiveLocalVaultPath(settings) : null;
    return activePath ? localVaultFolderName(activePath) : null;
  })();
  const activeLocalWorkspace = getActiveLocalWorkspace(settings);
  const { localVaults, localWorkspaces } = useSwitcherLocalFolders(settings?.localVault);
  const localWorkspaceName = activeLocalWorkspace && settings?.localVault.activeVaultId
    && activeLocalWorkspace.vaultIds.includes(settings.localVault.activeVaultId)
    ? activeLocalWorkspace.name
    : null;
  const activeVaultId = settings?.localVault.activeVaultId ?? null;
  // Opening a row in another folder's tree opens that folder of the set (a focus change: tabs and
  // search stay), then shows it once its snapshot is on screen (workspace-folder-switch). The steps
  // live in a store that records them as they are taken, as startup's do in Home: the rename
  // command's own render can run the driver again before a step reaches React.
  const [folderSwitch] = useState(createFolderSwitchStore);
  const [folderSwitchState, setFolderSwitchState] = useState(folderSwitch.getState);
  useEffect(() => {
    const sync = () => setFolderSwitchState(folderSwitch.getState());
    sync();
    return folderSwitch.subscribe(sync);
  }, [folderSwitch]);
  const activeSetId = displayScope.type === 'local' ? activeLocalWorkspace?.id ?? null : null;
  useEffect(() => {
    const commands = folderSwitch.advance({
      activeVaultId,
      snapshotId: localVaultId ?? null,
      activeSetId,
      noteFolderIds: (noteId) => folderTree.allNotes
        .find((candidate) => candidate.note.id === noteId)?.folderPath.map((folder) => folder.id),
      hasFolder: (folderId) => folderTree.nodesById.has(folderId),
    });
    for (const command of commands) {
      if (command.type === 'switch_vault') {
        localVaultActions.switchLocalVault(command.vaultId).then(
          () => folderSwitch.dispatch({ type: 'switch_finished', vaultId: command.vaultId }),
          (error: unknown) => {
            folderSwitch.dispatch({ type: 'switch_failed' });
            toast.error(error instanceof Error ? error.message : 'Failed to open that folder.');
          },
        );
      } else if (command.type === 'show_folder') {
        navigator.revealFolderIds(command.folderIds);
        navigator.handleFolderSelect(command.folderIds.at(-1) ?? UNFILED_FOLDER_ID);
      } else {
        const { action, folderId, name } = command;
        if (action === 'create-note') actions.chooseNewNoteLocation(folderId);
        else if (action === 'create-folder') folderCommands.handleCreateFolderInside(folderId);
        else if (folderId === null) continue;
        else if (action === 'rename' && name) mutations.renameFolderMutation.mutate({ folderId, input: { name } });
        else if (action === 'move') actions.moveFolderRequest(folderId);
        else if (action === 'edit') folderCommands.handleRenameFolder(folderId);
        else if (action === 'delete') folderCommands.handleDeleteFolderRequest(folderId);
        else if (action === 'reveal') localVaultActions.revealLocalFolder(folderId);
      }
    }
  }, [folderSwitchState, folderSwitch, activeVaultId, activeSetId, folderTree, localVaultId, navigator, actions, folderCommands, mutations.renameFolderMutation, localVaultActions]);
  // Read the store, not React state: a step recorded by the driver or a settled switch reaches
  // React a render later, and a click must see the switch as it stands.
  const isSwitchingFolder = () => folderSwitch.getState().switching !== null;
  /** Opening something by another path; a folder switch still waiting no longer counts. */
  const abandonFolderSwitch = () => folderSwitch.dispatch({ type: 'abandoned' });

  const requestWorkspaceFolder = (target: FolderSwitchTarget) => {
    folderSwitch.dispatch({ type: 'requested', target, snapshotId: localVaultId ?? null });
  };

  const openWorkspaceFolder = (vaultId: string, folderIds: string[]) => {
    if (vaultId === activeVaultId && !isSwitchingFolder()) {
      abandonFolderSwitch();
      navigator.revealFolderIds(folderIds);
      const leafFolderId = folderIds.at(-1);
      if (leafFolderId) navigator.handleFolderSelect(leafFolderId);
      return;
    }
    requestWorkspaceFolder(folderIds.length ? { kind: 'folder', vaultId, folderIds } : { kind: 'root', vaultId });
  };

  const openWorkspaceNote = (vaultId: string, note: NoteSummary) => {
    if (vaultId === activeVaultId && !isSwitchingFolder()) {
      abandonFolderSwitch();
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
        layout: noteWorkspace.state.layout,
        panes: noteWorkspace.state.panes,
        recentlyClosedTabs: noteWorkspace.state.recentlyClosedTabs,
        zoomedPaneId: noteWorkspace.state.zoomedPaneId,
      },
      actions: {
        moveActiveTabToOtherPane: noteWorkspace.moveActiveTabToOtherPane,
        moveTabToPane: noteWorkspace.moveTabToPane,
        openNoteAt: noteWorkspace.openNoteAt,
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
        splitTabToNewPane: noteWorkspace.splitTabToNewPane,
        togglePaneZoom: actions.togglePaneZoom,
        equalizePanes: noteWorkspace.equalizePanes,
        toggleNavigator: toggleNavigatorCollapsed,
        onNewTab,
      },
    },
    workspaceNavigation: {
      scope: displayScope,
      user,
      teams,
      platform: window.hackdeskAPI?.platform ?? window.navigator.platform,
      pinnedTeamIds: settings?.workspaceNavigation?.pinnedTeamIds ?? null,
      accountStatus: homeStatus.accountStatus,
      onChooseLocalVault: () => {
        abandonFolderSwitch();
        void localVaultActions.chooseLocalVault();
      },
      onManageLocalVaults: actions.openVaultSettings,
      onScopeChange: (next) => {
        overlayControls.close('trash');
        overlayControls.close('history');
        abandonFolderSwitch();
        actions.switchWorkspaceScope(next);
      },
      localVaults,
      localWorkspaces,
      activeLocalVaultId: settings?.localVault.activeVaultId ?? null,
      activeLocalWorkspaceId: settings?.localVault.activeWorkspaceId ?? null,
      onActivateLocalWorkspace: (workspaceId: string | null) => {
        overlayControls.close('workspaceSwitcher');
        abandonFolderSwitch();
        void localVaultActions.activateLocalWorkspace(workspaceId).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to open the local workspace.');
        });
      },
      onOpenLocalWorkspaceFolder: (workspaceId, vaultId) => {
        overlayControls.close('workspaceSwitcher');
        if (activeLocalWorkspace?.id === workspaceId && displayScope.type === 'local') {
          openWorkspaceFolder(vaultId, []);
          return;
        }
        folderSwitch.dispatch({ type: 'set_picked', workspaceId, vaultId });
        void localVaultActions.activateLocalWorkspace(workspaceId).catch((error) => {
          folderSwitch.dispatch({ type: 'set_pick_failed' });
          toast.error(error instanceof Error ? error.message : 'Failed to open the local workspace.');
        });
      },
      onOpenStandaloneLocalVault: (vaultId) => {
        overlayControls.close('workspaceSwitcher');
        abandonFolderSwitch();
        void localVaultActions.openStandaloneLocalVault(vaultId).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to open the local folder.');
        });
      },
      onSwitchLocalVault: (vaultId: string) => {
        overlayControls.close('workspaceSwitcher');
        abandonFolderSwitch();
        void localVaultActions.switchLocalVault(vaultId).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to switch local vault.');
        });
      },
      onOpenInNewWindow: api?.app.newWindow ? (scope: WorkspaceScope) => {
        overlayControls.close('workspaceSwitcher');
        const workspace: NewWindowWorkspaceScope = scope.type === 'team'
          ? { type: scope.type, label: scope.label, teamPath: scope.teamPath }
          : scope.type === 'local'
            ? { type: scope.type, label: scope.label, vaultId: scope.vaultId, workspaceId: scope.workspaceId }
            : { type: scope.type, label: scope.label };
        void api?.app.newWindow?.({ workspace }).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to open a new window.');
        });
      } : undefined,
      onOpenSettings: () => overlayControls.openSettings(),
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
    navigator: {
      scope: displayScope,
      tree: folderTree,
      vaultFolderName: localVaultPathName,
      localWorkspaceName,
      workspaceFolders,
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
        onOpenNote: actions.openTrashNote,
        scope: displayScope,
      } : undefined,
      history: true,
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
        onCopyNoteContent: actions.handleCopyNoteContent,
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
      isInspectorCollapsed: inspectorCollapsed,
      isPaneInspectorCollapsed,
      getPaneView: (pane) => {
        const view = documents.getPaneView(pane);
        return {
          ...view,
          isUploadingImage: view.isUploadingImage || (!!view.activeTab && uploadingTabIds.includes(view.activeTab.tabId)),
        };
      },
      onResizeSplit: noteWorkspace.resizeSplit,
      onEqualizeSplit: noteWorkspace.equalizeSplit,
      onFocusPane: noteWorkspace.focusPane,
      canCreateNote: homeStatus.navigatorStatus.canCreate,
      onCreateNote: folderCommands.handleCreateNote,
      onQuickOpen: actions.openQuickOpen,
      recentNotes,
    },
    documentActions: {
      onOpenEditor: actions.handleOpenEditor,
      onOpenExternal: actions.handleOpenExternal,
      onOpenNoteTarget: openNoteTarget,
      onRevealFolder: revealFolder,
      onSaveAsTemplate: saveAsTemplate,
      onPresent: api?.app.openPresentation && ((deck) => void api.app.openPresentation?.(deck)),
      onRevealInFinder: localVaultActions.revealLocalNote,
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
    },
  };
}
