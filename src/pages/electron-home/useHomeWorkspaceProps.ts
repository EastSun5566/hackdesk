import type { Dispatch, SetStateAction } from 'react';

import type { NoteFinderState } from '@/lib/electron-note-finder';
import type {
  DocumentSummary,
  TeamSummary,
  UserSummary,
} from '@/lib/electron-api';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';

import type { ElectronHomeWorkspaceProps } from './ElectronHomeWorkspace';
import type { HomeLocalVaultActions } from './useHomeLocalVaultActions';
import type { WorkspaceScope } from './types';
import { isDraftNoteTab } from './note-workspace';
import type { useElectronHomeStatus } from './useElectronHomeStatus';
import type { useElectronNoteMutations } from './useElectronNoteMutations';
import type { useLocalDocumentRecovery } from './useLocalDocumentRecovery';
import type { useNoteWorkspaceTabs } from './useNoteWorkspaceTabs';
import type { useWorkbenchDocuments } from './useWorkbenchDocuments';
import type { useWorkbenchFolderCommands } from './useWorkbenchFolderCommands';
import type { useWorkbenchNavigator } from './useWorkbenchNavigator';

type HomeStatus = ReturnType<typeof useElectronHomeStatus>;
type NoteMutations = ReturnType<typeof useElectronNoteMutations>;
type NoteWorkspace = ReturnType<typeof useNoteWorkspaceTabs>;
type WorkbenchDocuments = ReturnType<typeof useWorkbenchDocuments>;
type WorkbenchFolderCommands = ReturnType<typeof useWorkbenchFolderCommands>;
type WorkbenchNavigator = ReturnType<typeof useWorkbenchNavigator>;
type LocalDocumentRecovery = ReturnType<typeof useLocalDocumentRecovery>;

type WorkspaceActions = {
  handleCopyNoteLink: ElectronHomeWorkspaceProps['navigator']['actions']['onCopyNoteLink'];
  handleCopyNoteMarkdownLink: ElectronHomeWorkspaceProps['navigator']['actions']['onCopyNoteMarkdownLink'];
  handleDeleteRequest: ElectronHomeWorkspaceProps['navigator']['actions']['onDeleteNote'];
  handleDuplicateNote: ElectronHomeWorkspaceProps['navigator']['actions']['onDuplicateNote'];
  handleExportMarkdown: ElectronHomeWorkspaceProps['documentWorkspace']['onExportMarkdown'];
  handleExportNoteMarkdown: ElectronHomeWorkspaceProps['navigator']['actions']['onExportNoteMarkdown'];
  handleImportMarkdownNote: ElectronHomeWorkspaceProps['navigator']['actions']['onImportMarkdown'];
  handleNoteSelect: ElectronHomeWorkspaceProps['navigator']['actions']['onNoteSelect'];
  handleOpenEditor: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenNote'];
  handleOpenExternal: ElectronHomeWorkspaceProps['documentWorkspace']['onOpenExternal'];
  openHackmdTokenSetup: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenSettings'];
  openPalette: ElectronHomeWorkspaceProps['navigator']['actions']['onOpenPalette'];
  setFinderState: Dispatch<SetStateAction<NoteFinderState>>;
  setShareOpen: (open: boolean) => void;
  switchWorkspaceScope: (scope: WorkspaceScope) => void;
};

export function useHomeWorkspaceProps({
  actions,
  activeFinderState,
  attachImageRequestId,
  collapsedFolderIds,
  displayScope,
  documents,
  editorFocusRequestId,
  editorMode,
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
  navigator,
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
  tabLifecycle,
  teams,
  toggleInspectorCollapsed,
  toggleNavigatorCollapsed,
  toggleRailCollapsed,
  user,
}: {
  actions: WorkspaceActions;
  activeFinderState: NoteFinderState;
  attachImageRequestId: number;
  collapsedFolderIds: Set<string>;
  displayScope: WorkspaceScope;
  documents: WorkbenchDocuments;
  editorFocusRequestId: number;
  editorMode: ElectronHomeWorkspaceProps['documentWorkspace']['editorMode'];
  editorSearchRequestId: number;
  folderCommands: WorkbenchFolderCommands;
  folderTree: FolderTree;
  getTabSyncState: ElectronHomeWorkspaceProps['titlebar']['getTabSyncState'];
  hasConfiguredLocalVault: boolean;
  homeStatus: HomeStatus;
  inspectorCollapsed: boolean;
  localDocumentRecovery: LocalDocumentRecovery;
  localVaultActions: HomeLocalVaultActions;
  mutations: NoteMutations;
  navigator: WorkbenchNavigator;
  navigatorCollapsed: boolean;
  navigatorWidth: number;
  noteWorkspace: NoteWorkspace;
  railCollapsed: boolean;
  railWidth: number;
  refreshWorkspace: () => void;
  selectedFolderId: string | null;
  selectedNote: { id: string } | null;
  setNavigatorWidth: (width: number) => void;
  setRailWidth: (width: number) => void;
  setSettingsOpen: (open: boolean) => void;
  shareOpen: boolean;
  tabLifecycle: Pick<
    ElectronHomeWorkspaceProps['titlebar']['actions'],
    'requestCloseOtherTabs' | 'requestCloseTab' | 'requestCloseTabsToRight'
  >;
  teams: TeamSummary[];
  toggleInspectorCollapsed: () => void;
  toggleNavigatorCollapsed: () => void;
  toggleRailCollapsed: () => void;
  user: UserSummary | undefined;
}): ElectronHomeWorkspaceProps {
  return {
    titlebar: {
      getPaneTabs: documents.getPaneTabs,
      getPaneView: documents.getPaneView,
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
        requestCloseOtherTabs: tabLifecycle.requestCloseOtherTabs,
        requestCloseTab: tabLifecycle.requestCloseTab,
        requestCloseTabsToRight: tabLifecycle.requestCloseTabsToRight,
        selectTab: noteWorkspace.selectTab,
        splitActiveTab: noteWorkspace.splitActiveTab,
        toggleNavigator: toggleNavigatorCollapsed,
        toggleRail: toggleRailCollapsed,
      },
    },
    rail: {
      scope: displayScope,
      user,
      teams,
      collapsed: railCollapsed,
      accountStatus: homeStatus.accountStatus,
      localVaultConfigured: hasConfiguredLocalVault,
      width: railWidth,
      onChooseLocalVault: () => {
        void localVaultActions.chooseLocalVault();
      },
      onScopeChange: actions.switchWorkspaceScope,
      onOpenSettings: () => setSettingsOpen(true),
    },
    railResize: {
      disabled: railCollapsed,
      value: railWidth,
      onChange: setRailWidth,
    },
    navigator: {
      scope: displayScope,
      tree: folderTree,
      entries: navigator.visibleEntries,
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
        onFolderSelect: navigator.handleFolderSelect,
        onFolderToggle: navigator.toggleFolderCollapsed,
        onFolderRevealInFinder: localVaultActions.revealLocalFolder,
        onNoteSelect: actions.handleNoteSelect,
        onNoteRevealInFinder: localVaultActions.revealLocalNote,
        onFinderStateChange: actions.setFinderState,
        onRefresh: refreshWorkspace,
        onCreate: folderCommands.handleCreateNote,
        onCreateFolder: folderCommands.handleCreateFolder,
        onCreateFolderInside: folderCommands.handleCreateFolderInside,
        onCreateNoteInside: folderCommands.handleCreateNoteInside,
        onChooseLocalVault: () => {
          void localVaultActions.chooseLocalVault();
        },
        onRenameFolder: folderCommands.handleRenameFolder,
        onDeleteFolder: folderCommands.handleDeleteFolderRequest,
        onFolderDrop: folderCommands.handleFolderDrop,
        onNoteMove: navigator.handleNoteMove,
        onOpenNote: actions.handleOpenEditor,
        onRevealNoteFolder: (entry: FolderTreeNote) => {
          void navigator.revealNoteEntry(entry);
        },
        onCopyNoteLink: actions.handleCopyNoteLink,
        onCopyNoteMarkdownLink: actions.handleCopyNoteMarkdownLink,
        onDuplicateNote: actions.handleDuplicateNote,
        onExportNoteMarkdown: actions.handleExportNoteMarkdown,
        onDeleteNote: actions.handleDeleteRequest,
        onImportMarkdown: actions.handleImportMarkdownNote,
        onToggleCollapsed: toggleNavigatorCollapsed,
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
      activePaneId: noteWorkspace.state.activePaneId,
      editorMode,
      folderTree,
      shareOpen,
      isInspectorCollapsed: inspectorCollapsed,
      getPaneView: documents.getPaneView,
      editorSearchRequestId,
      attachImageRequestId,
      editorFocusRequestId,
      onResizePanes: noteWorkspace.resizePanes,
      onFocusPane: noteWorkspace.focusPane,
      onOpenEditor: actions.handleOpenEditor,
      onOpenExternal: actions.handleOpenExternal,
      onRevealInFinder: localVaultActions.revealLocalNote,
      onCopyLink: actions.handleCopyNoteLink,
      onCopyMarkdownLink: actions.handleCopyNoteMarkdownLink,
      onExportMarkdown: actions.handleExportMarkdown,
      onReloadFromDisk: localDocumentRecovery.reloadFromDisk,
      onSave: (tab, input) => {
        if (isDraftNoteTab(tab)) {
          mutations.createDraftNoteMutation.mutate({ tabId: tab.tabId, input });
          return;
        }

        const document = documents.getTabDocument(tab);
        if (document) {
          mutations.updateNoteMutation.mutate({ note: document, input });
        }
      },
      onSaveAsCopy: localDocumentRecovery.saveAsCopy,
      onSaveMetadata: (note: DocumentSummary, input) => mutations.updateNoteMutation.mutate({ note, input }),
      onSaveSharing: (note: DocumentSummary, input) => mutations.updateNoteMutation.mutate({
        note,
        input,
        successMessage: 'Sharing settings updated.',
      }),
      onUploadImage: (note: DocumentSummary, input) => mutations.uploadNoteImageMutation.mutateAsync({ note, input }),
      onDelete: actions.handleDeleteRequest,
      onTitleChange: documents.handleDocumentTitleChange,
      onContentChange: documents.handleDocumentContentChange,
      onToggleInspector: toggleInspectorCollapsed,
      onShareOpenChange: actions.setShareOpen,
    },
  };
}
