import { useMemo } from 'react';
import { toast } from '@/components/ui/toast';

import type {
  DocumentSummary,
  HackDeskElectronAPI,
} from '@/lib/electron-api';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import type { EditorMode } from '@/lib/settings';

import type { OpenNoteTab } from './note-workspace';
import type { ElectronFocusZone } from './useElectronFocusZones';
import {
  exportDebugLogs,
  openHackmdWebEditor,
  type WorkbenchActionHandlers,
} from './useWorkbenchActions';

export type WorkbenchActionHandlersOptions = {
  activePaneId: string;
  activeTab: OpenNoteTab | null;
  api?: HackDeskElectronAPI;
  bumpAttachImageRequest: () => void;
  bumpEditorSearchRequest: () => void;
  createFolder: () => void;
  createNote: () => void;
  deleteNote: (note: DocumentSummary) => void;
  documentContent: string;
  documentTitle: string;
  duplicateActiveTab: () => void;
  exportMarkdown: (note: DocumentSummary, title: string, content: string) => void;
  focusNextPane: () => void;
  focusNextTab: () => void;
  focusPreviousPane: () => void;
  focusPreviousTab: () => void;
  focusWorkspaceSearch: () => void;
  focusZone: (zone: ElectronFocusZone) => void;
  importMarkdownNote: () => void;
  isSavingNote: boolean;
  moveActiveTabToOtherPane: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  noteDirty: boolean;
  openPalette: () => void;
  openQuickOpen: () => void;
  refreshWorkspace: () => void;
  renameFolder: (folderId: string) => void;
  requestCloseOtherTabs: (paneId: string, tabId: string) => Promise<unknown>;
  requestCloseTab: (tabId: string) => Promise<boolean>;
  requestCloseTabsToRight: (paneId: string, tabId: string) => Promise<unknown>;
  requestDeleteFolder: (folderId: string) => void;
  reopenLastClosedTab: () => void;
  saveNote: (note: DocumentSummary, input: { title: string; content: string }) => void;
  setEditorMode: (mode: EditorMode) => void;
  selectedDocument?: DocumentSummary;
  selectedFolderId: string | null;
  setSettingsOpen: (open: boolean) => void;
  splitActiveTab: () => void;
  switchToHistory: () => void;
  toggleInspector: () => void;
  toggleNavigator: () => void;
  toggleTheme: () => void;
  toggleWorkspaceRail: () => void;
  trackRecentNote: (note: DocumentSummary) => void;
};

export function useWorkbenchActionHandlers({
  activePaneId,
  activeTab,
  api,
  bumpAttachImageRequest,
  bumpEditorSearchRequest,
  createFolder,
  createNote,
  deleteNote,
  documentContent,
  documentTitle,
  duplicateActiveTab,
  exportMarkdown,
  focusNextPane,
  focusNextTab,
  focusPreviousPane,
  focusPreviousTab,
  focusWorkspaceSearch,
  focusZone,
  importMarkdownNote,
  isSavingNote,
  moveActiveTabToOtherPane,
  navigateBack,
  navigateForward,
  noteDirty,
  openPalette,
  openQuickOpen,
  refreshWorkspace,
  renameFolder,
  requestCloseOtherTabs,
  requestCloseTab,
  requestCloseTabsToRight,
  requestDeleteFolder,
  reopenLastClosedTab,
  saveNote,
  setEditorMode,
  selectedDocument,
  selectedFolderId,
  setSettingsOpen,
  splitActiveTab,
  switchToHistory,
  toggleInspector,
  toggleNavigator,
  toggleTheme,
  toggleWorkspaceRail,
  trackRecentNote,
}: WorkbenchActionHandlersOptions): WorkbenchActionHandlers {
  return useMemo<WorkbenchActionHandlers>(() => ({
    closeActiveTab: () => {
      if (activeTab) {
        void requestCloseTab(activeTab.tabId);
      }
    },
    closeOtherTabs: () => {
      if (activeTab) {
        void requestCloseOtherTabs(activePaneId, activeTab.tabId);
      }
    },
    closeTabsToRight: () => {
      if (activeTab) {
        void requestCloseTabsToRight(activePaneId, activeTab.tabId);
      }
    },
    createFolder,
    createNote,
    deleteSelectedFolder: () => {
      if (selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID) {
        requestDeleteFolder(selectedFolderId);
      } else {
        toast.info('Select a folder before deleting it.');
      }
    },
    deleteSelectedNote: () => {
      if (selectedDocument) {
        deleteNote(selectedDocument);
      }
    },
    duplicateActiveTab,
    exportDebugLogs: () => exportDebugLogs(api),
    exportSelectedMarkdown: () => {
      if (selectedDocument) {
        exportMarkdown(selectedDocument, documentTitle, documentContent);
      }
    },
    attachImage: bumpAttachImageRequest,
    findInNote: bumpEditorSearchRequest,
    focusEditor: () => focusZone('editor'),
    focusInspector: () => focusZone('inspector'),
    focusNavigator: () => focusZone('navigator'),
    focusNextPane: () => {
      focusNextPane();
      focusZone('editor');
    },
    focusNextTab: () => {
      focusNextTab();
      focusZone('editor');
    },
    focusPreviousPane: () => {
      focusPreviousPane();
      focusZone('editor');
    },
    focusPreviousTab: () => {
      focusPreviousTab();
      focusZone('editor');
    },
    focusWorkspace: () => focusZone('workspace'),
    focusWorkspaceSearch,
    goHistory: () => {
      switchToHistory();
      focusZone('navigator');
    },
    importMarkdownNote,
    moveTabToOtherPane: () => {
      moveActiveTabToOtherPane();
      focusZone('editor');
    },
    navigateBack: () => {
      navigateBack();
      focusZone('editor');
    },
    navigateForward: () => {
      navigateForward();
      focusZone('editor');
    },
    openPalette,
    openQuickOpen,
    openSelectedWebEditor: () => openHackmdWebEditor(api, selectedDocument, trackRecentNote),
    openSettings: () => setSettingsOpen(true),
    refreshWorkspace,
    renameSelectedFolder: () => {
      if (selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID) {
        renameFolder(selectedFolderId);
      } else {
        toast.info('Select a folder before renaming it.');
      }
    },
    reopenLastClosedTab: () => {
      reopenLastClosedTab();
      focusZone('editor');
    },
    saveNote: () => {
      if (selectedDocument && noteDirty && !isSavingNote) {
        saveNote(selectedDocument, { title: documentTitle, content: documentContent });
      }
    },
    setEditorMode,
    splitPaneRight: () => {
      splitActiveTab();
      focusZone('editor');
    },
    toggleInspector,
    toggleNavigator,
    toggleTheme,
    toggleWorkspaceRail,
  }), [
    activePaneId,
    activeTab,
    api,
    bumpAttachImageRequest,
    bumpEditorSearchRequest,
    createFolder,
    createNote,
    deleteNote,
    documentContent,
    documentTitle,
    duplicateActiveTab,
    exportMarkdown,
    focusNextPane,
    focusNextTab,
    focusPreviousPane,
    focusPreviousTab,
    focusWorkspaceSearch,
    focusZone,
    importMarkdownNote,
    isSavingNote,
    moveActiveTabToOtherPane,
    navigateBack,
    navigateForward,
    noteDirty,
    openPalette,
    openQuickOpen,
    refreshWorkspace,
    renameFolder,
    reopenLastClosedTab,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
    requestDeleteFolder,
    saveNote,
    setEditorMode,
    selectedDocument,
    selectedFolderId,
    setSettingsOpen,
    splitActiveTab,
    switchToHistory,
    toggleInspector,
    toggleNavigator,
    toggleTheme,
    toggleWorkspaceRail,
    trackRecentNote,
  ]);
}
