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

import type { NoteWorkspaceState } from './note-workspace';
import type { WorkspaceScope } from './types';

export type WorkbenchActionContextInput = {
  canCreate: boolean;
  canModifySelectedFolder: boolean;
  editorMode: EditorMode;
  hasToken: boolean;
  inspectorCollapsed: boolean;
  isSavingNote: boolean;
  navigatorCollapsed: boolean;
  noteDirty: boolean;
  scopeType: WorkspaceScope['type'];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  workspaceRailCollapsed: boolean;
  workspaceState: NoteWorkspaceState;
};

export type WorkbenchActionHandlers = {
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
  findInNote: () => void;
  focusEditor: () => void;
  focusInspector: () => void;
  focusNavigator: () => void;
  focusNextPane: () => void;
  focusNextTab: () => void;
  focusPreviousPane: () => void;
  focusPreviousTab: () => void;
  focusWorkspace: () => void;
  focusWorkspaceSearch: () => void;
  goHistory: () => void;
  importMarkdownNote: () => void;
  moveTabToOtherPane: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  openPalette: () => void;
  openSettings: () => void;
  openSelectedWebEditor: () => void;
  refreshWorkspace: () => void;
  renameSelectedFolder: () => void;
  reopenLastClosedTab: () => void;
  saveNote: () => void;
  setEditorMode: (mode: EditorMode) => void;
  splitPaneRight: () => void;
  toggleInspector: () => void;
  toggleNavigator: () => void;
  toggleTheme: () => void;
  toggleWorkspaceRail: () => void;
};

export type WorkbenchActionsOptions = WorkbenchActionContextInput & {
  handlers: WorkbenchActionHandlers;
  hasActiveTab: boolean;
};

export function createWorkbenchActionContext({
  canCreate,
  canModifySelectedFolder,
  editorMode,
  hasToken,
  inspectorCollapsed,
  isSavingNote,
  navigatorCollapsed,
  noteDirty,
  scopeType,
  selectedFolderId,
  selectedNoteId,
  workspaceRailCollapsed,
  workspaceState,
}: WorkbenchActionContextInput): ElectronActionContext {
  const activePane = workspaceState.panes.find((pane) => pane.paneId === workspaceState.activePaneId);
  const activeTabIndex = activePane?.activeTabId ? activePane.tabIds.indexOf(activePane.activeTabId) : -1;

  return {
    activePaneTabCount: activePane?.tabIds.length ?? 0,
    activePaneTabsToRightCount: activePane && activeTabIndex >= 0 ? activePane.tabIds.length - activeTabIndex - 1 : 0,
    canCreate,
    canModifySelectedFolder,
    editorMode,
    hasToken,
    inspectorCollapsed,
    isSavingNote,
    navigatorCollapsed,
    noteDirty,
    navigationBackCount: workspaceState.backStack.length,
    navigationForwardCount: workspaceState.forwardStack.length,
    openTabCount: Object.keys(workspaceState.tabs).length,
    paneCount: workspaceState.panes.length,
    recentlyClosedTabCount: workspaceState.recentlyClosedTabs.length,
    scopeType,
    selectedFolderId,
    selectedNoteId,
    workspaceRailCollapsed,
  };
}

export function useWorkbenchActions(options: WorkbenchActionsOptions) {
  const {
    canCreate,
    canModifySelectedFolder,
    editorMode,
    handlers,
    hasActiveTab,
    hasToken,
    inspectorCollapsed,
    isSavingNote,
    navigatorCollapsed,
    noteDirty,
    scopeType,
    selectedFolderId,
    selectedNoteId,
    workspaceRailCollapsed,
    workspaceState,
  } = options;
  const actionContext = useMemo(() => createWorkbenchActionContext({
    canCreate,
    canModifySelectedFolder,
    editorMode,
    hasToken,
    inspectorCollapsed,
    isSavingNote,
    navigatorCollapsed,
    noteDirty,
    scopeType,
    selectedFolderId,
    selectedNoteId,
    workspaceRailCollapsed,
    workspaceState,
  }), [
    canCreate,
    canModifySelectedFolder,
    editorMode,
    hasToken,
    inspectorCollapsed,
    isSavingNote,
    navigatorCollapsed,
    noteDirty,
    scopeType,
    selectedFolderId,
    selectedNoteId,
    workspaceRailCollapsed,
    workspaceState,
  ]);

  const runAction = useCallback((actionId: ElectronActionId) => {
    const action = getElectronAction(actionId);
    const disabledReason = getActionDisabledReason(action, actionContext);
    if (disabledReason) {
      toast.info(disabledReason);
      return;
    }

    switch (actionId) {
    case 'open-command-palette':
      handlers.openPalette();
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
    case 'navigate-back':
      handlers.navigateBack();
      break;
    case 'navigate-forward':
      handlers.navigateForward();
      break;
    case 'go-history':
      handlers.goHistory();
      break;
    case 'toggle-workspace-rail':
      handlers.toggleWorkspaceRail();
      break;
    case 'toggle-navigator':
      handlers.toggleNavigator();
      break;
    case 'toggle-inspector':
      handlers.toggleInspector();
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
    case 'export-note-markdown':
      handlers.exportSelectedMarkdown();
      break;
    case 'open-note-web-editor':
      handlers.openSelectedWebEditor();
      break;
    case 'delete-note':
      handlers.deleteSelectedNote();
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
      handlers.focusWorkspace();
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
