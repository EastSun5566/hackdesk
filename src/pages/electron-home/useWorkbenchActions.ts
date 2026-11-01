import { useCallback, useMemo } from 'react';
import { toast } from '@/components/ui/toast';

import type {
  DocumentSummary,
  ElectronActionId,
  HackDeskElectronAPI,
} from '@/lib/electron-api';
import {
  getActionDisabledReason,
  getElectronAction,
  type ElectronActionContext,
} from '@/lib/electron-actions';
import { toOpenHackmdEditorInput } from '@/lib/electron-note-links';
import type { EditorMode } from '@/lib/settings';

import { scrollFocusedRegion } from './workbench-keyboard-context';

import { isDraftNoteTab, type NoteWorkspaceState } from './note-workspace';
import type { WorkspaceScope } from './types';
import type { PaneDirection } from './pane-layout';

export type WorkbenchActionContextInput = {
  bookContentsHidden: boolean;
  bookOpen: boolean;
  canCreate: boolean;
  canModifySelectedFolder: boolean;
  editorMode: EditorMode;
  hasLocalVault: boolean;
  hasToken: boolean;
  inspectorCollapsed: boolean;
  isSavingNote: boolean;
  keyHintsVisible: boolean;
  hackMode?: boolean;
  navigatorCollapsed: boolean;
  noteDirty: boolean;
  scopeType: WorkspaceScope['type'];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  workspaceState: NoteWorkspaceState;
};

export type WorkbenchActionHandlers = {
  openKeyboardShortcuts: () => void;
  openLeaderMenu: () => void;
  focusNextRegion: (backwards?: boolean) => boolean;
  closeActiveTab: () => void;
  closeOtherTabs: () => void;
  closeTabsToRight: () => void;
  createFolder: () => void;
  createNote: () => void;
  deleteSelectedFolder: () => void;
  deleteSelectedNote: () => void;
  duplicateActiveTab: () => void;
  exportDebugLogs: () => void;
  exportSelectedMarkdown: () => void;
  attachImage: () => void;
  aiAssist: () => void;
  askNotes: () => void;
  dictate: () => void;
  findInNote: () => void;
  focusEditor: () => void;
  focusInspector: () => void;
  focusNavigator: () => void;
  focusNextPane: () => void;
  focusNextTab: () => void;
  focusPreviousPane: () => void;
  focusPreviousTab: () => void;
  openWorkspaceSwitcher: () => void;
  focusWorkspaceSearch: () => void;
  goHistory: () => void;
  showTrash: () => void;
  importMarkdownNote: () => void;
  moveTabToOtherPane: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  openPalette: () => void;
  openQuickOpen: () => void;
  openSettings: () => void;
  openSelectedWebEditor: () => void;
  showNoteVersions: () => void;
  openAsBook: () => void;
  presentNote: () => void;
  createNoteFromTemplate: () => void;
  saveAsTemplate: () => void;
  openAdjacentChapter: (step: -1 | 1) => void;
  refreshWorkspace: () => void;
  renameSelectedFolder: () => void;
  reopenLastClosedTab: () => void;
  saveNote: () => void;
  setEditorMode: (mode: EditorMode) => void;
  splitPaneRight: () => void;
  splitPaneDown: () => void;
  focusPaneInDirection: (direction: PaneDirection) => void;
  togglePaneZoom: () => void;
  equalizePanes: () => void;
  toggleInspector: () => void;
  toggleKeyHints: () => void;
  toggleNavigator: () => void;
  toggleHackMode: () => void;
  openViewOptions: () => void;
  toggleTheme: () => void;
  renameNote: () => void;
  duplicateSelectedNote: () => void;
  moveNoteToFolder: () => void;
  revealNoteInFinder: () => void;
  copyNoteLink: () => void;
  copyMarkdownLink: () => void;
  shareNote: () => void;
  moveTab: (step: -1 | 1) => void;
  toggleBookContents: () => void;
  closeBook: () => void;
  changeLocalVault: () => void;
  revealVaultInFinder: () => void;
  clearOfflineCopies: () => void;
};

export type WorkbenchActionsOptions = WorkbenchActionContextInput & {
  handlers: WorkbenchActionHandlers;
  hasActiveTab: boolean;
};

export function createWorkbenchActionContext({
  bookContentsHidden,
  bookOpen,
  canCreate,
  canModifySelectedFolder,
  editorMode,
  hasLocalVault,
  hasToken,
  inspectorCollapsed,
  isSavingNote,
  keyHintsVisible,
  hackMode,
  navigatorCollapsed,
  noteDirty,
  scopeType,
  selectedFolderId,
  selectedNoteId,
  workspaceState,
}: WorkbenchActionContextInput): ElectronActionContext {
  const activePane = workspaceState.panes.find((pane) => pane.paneId === workspaceState.activePaneId);
  const activeTabIndex = activePane?.activeTabId ? activePane.tabIds.indexOf(activePane.activeTabId) : -1;
  const activeTab = activePane?.activeTabId ? workspaceState.tabs[activePane.activeTabId] ?? null : null;

  return {
    activeTabIsDraft: isDraftNoteTab(activeTab),
    activePaneTabCount: activePane?.tabIds.length ?? 0,
    activePaneTabsToLeftCount: Math.max(activeTabIndex, 0),
    activePaneTabsToRightCount: activePane && activeTabIndex >= 0 ? activePane.tabIds.length - activeTabIndex - 1 : 0,
    bookContentsHidden,
    bookOpen,
    canCreate,
    canModifySelectedFolder,
    editorMode,
    hasLocalVault,
    hasToken,
    inspectorCollapsed,
    isSavingNote,
    keyHintsVisible,
    hackMode,
    navigatorCollapsed,
    noteDirty,
    navigationBackCount: workspaceState.backStack.length,
    navigationForwardCount: workspaceState.forwardStack.length,
    openTabCount: Object.keys(workspaceState.tabs).length,
    paneCount: workspaceState.panes.length,
    paneZoomed: Boolean(workspaceState.zoomedPaneId),
    recentlyClosedTabCount: workspaceState.recentlyClosedTabs.length,
    scopeType,
    selectedFolderId,
    selectedNoteId,
  };
}

export function useWorkbenchActions(options: WorkbenchActionsOptions) {
  const {
    bookContentsHidden,
    bookOpen,
    canCreate,
    canModifySelectedFolder,
    editorMode,
    handlers,
    hasActiveTab,
    hasLocalVault,
    hasToken,
    inspectorCollapsed,
    isSavingNote,
    keyHintsVisible,
    hackMode,
    navigatorCollapsed,
    noteDirty,
    scopeType,
    selectedFolderId,
    selectedNoteId,
    workspaceState,
  } = options;
  const actionContext = useMemo(() => createWorkbenchActionContext({
    bookContentsHidden,
    bookOpen,
    canCreate,
    canModifySelectedFolder,
    editorMode,
    hasLocalVault,
    hasToken,
    inspectorCollapsed,
    isSavingNote,
    keyHintsVisible,
    hackMode,
    navigatorCollapsed,
    noteDirty,
    scopeType,
    selectedFolderId,
    selectedNoteId,
    workspaceState,
  }), [
    bookContentsHidden,
    bookOpen,
    canCreate,
    canModifySelectedFolder,
    editorMode,
    hasLocalVault,
    hasToken,
    inspectorCollapsed,
    isSavingNote,
    keyHintsVisible,
    hackMode,
    navigatorCollapsed,
    noteDirty,
    scopeType,
    selectedFolderId,
    selectedNoteId,
    workspaceState,
  ]);

  const runAction = useCallback((actionId: ElectronActionId) => {
    const action = getElectronAction(actionId);
    const disabledReason = getActionDisabledReason(action, actionContext);
    if (disabledReason) {
      toast.info(disabledReason);
      return false;
    }

    switch (actionId) {
    case 'show-keyboard-shortcuts':
      handlers.openKeyboardShortcuts();
      break;
    case 'open-leader-menu':
      handlers.openLeaderMenu();
      break;
    case 'focus-next-region':
      return handlers.focusNextRegion();
    case 'focus-previous-region':
      return handlers.focusNextRegion(true);
    case 'scroll-half-page-up':
      return scrollFocusedRegion(-1);
    case 'scroll-half-page-down':
      return scrollFocusedRegion(1);
    case 'open-command-palette':
      handlers.openPalette();
      break;
    case 'open-quick-open':
      handlers.openQuickOpen();
      break;
    case 'open-settings':
      handlers.openSettings();
      break;
    case 'toggle-theme':
      handlers.toggleTheme();
      break;
    case 'set-editor-mode-standard':
      handlers.setEditorMode('standard');
      break;
    case 'set-editor-mode-vim':
      handlers.setEditorMode('vim');
      break;
    case 'set-editor-mode-helix':
      handlers.setEditorMode('helix');
      break;
    case 'set-editor-mode-emacs':
      handlers.setEditorMode('emacs');
      break;
    case 'set-editor-mode-kakoune':
      handlers.setEditorMode('kakoune');
      break;
    case 'new-tab':
      if (hasActiveTab) {
        handlers.duplicateActiveTab();
        handlers.focusEditor();
      } else {
        handlers.openPalette();
      }
      break;
    case 'new-note':
      handlers.createNote();
      break;
    case 'new-folder':
      handlers.createFolder();
      break;
    case 'import-markdown-note':
      handlers.importMarkdownNote();
      break;
    case 'rename-folder':
      handlers.renameSelectedFolder();
      break;
    case 'delete-folder':
      handlers.deleteSelectedFolder();
      break;
    case 'refresh':
      handlers.refreshWorkspace();
      break;
    case 'search-notes':
      handlers.focusWorkspaceSearch();
      break;
    case 'show-view-options':
      handlers.openViewOptions();
      break;
    case 'navigate-back':
      handlers.navigateBack();
      break;
    case 'navigate-forward':
      handlers.navigateForward();
      break;
    case 'go-history':
      handlers.goHistory();
      break;
    case 'show-trash':
      handlers.showTrash();
      break;
    case 'toggle-navigator':
      handlers.toggleNavigator();
      break;
    case 'toggle-hack-mode':
      handlers.toggleHackMode();
      break;
    case 'toggle-inspector':
      handlers.toggleInspector();
      break;
    case 'toggle-key-hints':
      handlers.toggleKeyHints();
      break;
    case 'save-note':
      handlers.saveNote();
      break;
    case 'find-in-note':
      handlers.findInNote();
      break;
    case 'attach-image':
      handlers.attachImage();
      break;
    case 'ai-assist':
      handlers.aiAssist();
      break;
    case 'ask-notes':
      handlers.askNotes();
      break;
    case 'dictate':
      handlers.dictate();
      break;
    case 'export-note-markdown':
      handlers.exportSelectedMarkdown();
      break;
    case 'open-note-web-editor':
      handlers.openSelectedWebEditor();
      break;
    case 'show-note-versions':
      handlers.showNoteVersions();
      break;
    case 'new-note-from-template':
      handlers.createNoteFromTemplate();
      break;
    case 'save-as-template':
      handlers.saveAsTemplate();
      break;
    case 'open-as-book':
      handlers.openAsBook();
      break;
    case 'present-note':
      handlers.presentNote();
      break;
    case 'previous-chapter':
      handlers.openAdjacentChapter(-1);
      break;
    case 'next-chapter':
      handlers.openAdjacentChapter(1);
      break;
    case 'delete-note':
      handlers.deleteSelectedNote();
      break;
    case 'rename-note':
      handlers.renameNote();
      break;
    case 'duplicate-note':
      handlers.duplicateSelectedNote();
      break;
    case 'move-note-to-folder':
      handlers.moveNoteToFolder();
      break;
    case 'reveal-note-in-finder':
      handlers.revealNoteInFinder();
      break;
    case 'copy-note-link':
      handlers.copyNoteLink();
      break;
    case 'copy-markdown-link':
      handlers.copyMarkdownLink();
      break;
    case 'share-note':
      handlers.shareNote();
      break;
    case 'toggle-book-contents':
      handlers.toggleBookContents();
      break;
    case 'close-book':
      handlers.closeBook();
      break;
    case 'move-tab-left':
      handlers.moveTab(-1);
      break;
    case 'move-tab-right':
      handlers.moveTab(1);
      break;
    case 'change-local-vault':
      handlers.changeLocalVault();
      break;
    case 'reveal-vault-in-finder':
      handlers.revealVaultInFinder();
      break;
    case 'clear-offline-copies':
      handlers.clearOfflineCopies();
      break;
    case 'close-tab':
      handlers.closeActiveTab();
      break;
    case 'close-other-tabs':
      handlers.closeOtherTabs();
      break;
    case 'close-tabs-to-right':
      handlers.closeTabsToRight();
      break;
    case 'reopen-last-closed-tab':
      handlers.reopenLastClosedTab();
      break;
    case 'split-pane-right':
      handlers.splitPaneRight();
      break;
    case 'split-pane-down':
      handlers.splitPaneDown();
      break;
    case 'toggle-pane-zoom':
      handlers.togglePaneZoom();
      break;
    case 'equalize-panes':
      handlers.equalizePanes();
      break;
    case 'focus-pane-left':
    case 'focus-pane-down':
    case 'focus-pane-up':
    case 'focus-pane-right':
      handlers.focusPaneInDirection(actionId.slice('focus-pane-'.length) as PaneDirection);
      break;
    case 'move-tab-to-other-pane':
      handlers.moveTabToOtherPane();
      break;
    case 'focus-next-tab':
      handlers.focusNextTab();
      break;
    case 'focus-previous-tab':
      handlers.focusPreviousTab();
      break;
    case 'focus-next-pane':
      handlers.focusNextPane();
      break;
    case 'focus-previous-pane':
      handlers.focusPreviousPane();
      break;
    case 'export-debug-logs':
      handlers.exportDebugLogs();
      break;
    case 'focus-workspace':
      handlers.openWorkspaceSwitcher();
      break;
    case 'focus-navigator':
      handlers.focusNavigator();
      break;
    case 'focus-editor':
      handlers.focusEditor();
      break;
    case 'focus-inspector':
      handlers.focusInspector();
      break;
    }
    return true;
  }, [actionContext, handlers, hasActiveTab]);

  return {
    actionContext,
    runAction,
  };
}

export function exportDebugLogs(api: HackDeskElectronAPI | undefined) {
  void api?.app.exportDebugLogs()
    .then((path) => toast.success('Debug logs exported.', { description: path }))
    .catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to export debug logs.');
    });
}

export function clearOfflineCopies(api: HackDeskElectronAPI | undefined) {
  const noteIndex = api?.noteIndex;
  if (!api || !noteIndex) return;
  void api.app.confirm({
    title: 'Clear Offline Copies',
    message: 'Clear the HackMD notes kept on this computer?',
    detail: 'They are no longer readable offline or searchable by text until you open them again. Local Vault notes and unsaved edits are not affected.',
    confirmLabel: 'Clear',
    cancelLabel: 'Cancel',
    destructive: true,
  })
    .then(async ({ confirmed }) => {
      if (!confirmed) return;
      await noteIndex.clear();
      toast.success('Offline copies cleared.');
    })
    .catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to clear offline copies.');
    });
}

export function openHackmdWebEditor(
  api: HackDeskElectronAPI | undefined,
  selectedDocument: DocumentSummary | undefined,
  trackRecentNote: (note: DocumentSummary) => void,
) {
  if (!api || !selectedDocument) {
    return;
  }

  trackRecentNote(selectedDocument);
  void Promise.resolve(api.shell.openHackmdEditor(toOpenHackmdEditorInput(selectedDocument))).catch((error) => {
    toast.error(error instanceof Error ? error.message : 'Failed to open HackMD editor.');
  });
}
