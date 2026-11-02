import { useMemo } from 'react';
import { toast } from '@/components/ui/toast';

import type {
  DocumentSummary,
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import type { EditorMode } from '@/lib/settings';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { isDraftNoteTab, type OpenNoteTab } from './note-workspace';
import type { BookSession } from './useBookSession';
import type { ElectronFocusZone } from './useElectronFocusZones';
import {
  clearOfflineCopies,
  exportDebugLogs,
  openHackmdWebEditor,
  type WorkbenchActionHandlers,
} from './useWorkbenchActions';
import type { PaneDirection } from './pane-layout';

export type WorkbenchActionHandlersOptions = {
  activePaneId: string;
  activePaneTabIds: string[];
  activeTab: OpenNoteTab | null;
  api?: HackDeskElectronAPI;
  book: BookSession;
  bumpAttachImageRequest: () => void;
  bumpRenameRequest: () => void;
  bumpAiAssistRequest: () => void;
  bumpDictateRequest: () => void;
  bumpEditorSearchRequest: () => void;
  createFolder: () => void;
  createNote: () => void;
  createNoteFromTemplate: () => void;
  askNotes: () => void;
  saveAsTemplate: () => void;
  deleteNote: (note: DocumentSummary) => void;
  documentContent: string;
  documentTitle: string;
  duplicateActiveTab: () => void;
  exportMarkdown: (note: DocumentSummary, title: string, content: string) => void;
  focusNextPane: () => void;
  focusPaneToward: (direction: PaneDirection) => void;
  togglePaneZoom: () => void;
  equalizePanes: () => void;
  splitActivePaneDown: () => void;
  focusNextTab: () => void;
  focusPreviousPane: () => void;
  focusPreviousTab: () => void;
  focusWorkspaceSearch: () => void;
  focusZone: (zone: ElectronFocusZone, options?: { afterMove?: boolean }) => void;
  importMarkdownNote: () => void;
  isSavingNote: boolean;
  moveActiveTabToOtherPane: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  noteDirty: boolean;
  openKeyboardShortcuts: () => void;
  openLeaderMenu: () => void;
  toggleHackMode: () => void;
  openViewOptions: () => void;
  focusNextRegion: (backwards?: boolean) => boolean;
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
  saveDraftNote: (tab: OpenNoteTab, input: { title: string; content: string }) => void;
  setEditorMode: (mode: EditorMode) => void;
  selectedDocument?: DocumentSummary;
  selectedFolderId: string | null;
  setSettingsOpen: (open: boolean) => void;
  setTrashOpen: (open: boolean) => void;
  setVersionsOpen: (open: boolean) => void;
  splitActiveTab: () => void;
  switchToHistory: () => void;
  toggleInspector: () => void;
  toggleKeyHints: () => void;
  toggleNavigator: () => void;
  toggleTheme: () => void;
  openWorkspaceSwitcher: () => void;
  trackRecentNote: (note: DocumentSummary) => void;
  chooseLocalVault: () => void;
  copyNoteLink: (note: NoteSummary) => void;
  copyNoteMarkdownLink: (note: NoteSummary) => void;
  duplicateNote: (note: NoteSummary) => void;
  openMoveNotePicker: () => void;
  openShare: () => void;
  reorderTab: (paneId: string, tabId: string, overTabId: string) => void;
  revealLocalNote: (note: NoteSummary) => void;
  revealLocalVault: () => Promise<void>;
};

export function useWorkbenchActionHandlers({
  activePaneId,
  activePaneTabIds,
  activeTab,
  api,
  book,
  bumpAttachImageRequest,
  bumpRenameRequest,
  bumpAiAssistRequest,
  bumpDictateRequest,
  bumpEditorSearchRequest,
  createFolder,
  createNote,
  createNoteFromTemplate,
  askNotes,
  saveAsTemplate,
  deleteNote,
  documentContent,
  documentTitle,
  duplicateActiveTab,
  exportMarkdown,
  focusNextPane,
  focusPaneToward,
  togglePaneZoom,
  equalizePanes,
  splitActivePaneDown,
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
  openKeyboardShortcuts,
  openLeaderMenu,
  toggleHackMode,
  openViewOptions,
  focusNextRegion,
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
  saveDraftNote,
  setEditorMode,
  selectedDocument,
  selectedFolderId,
  setSettingsOpen,
  setTrashOpen,
  setVersionsOpen,
  splitActiveTab,
  switchToHistory,
  toggleInspector,
  toggleKeyHints,
  toggleNavigator,
  toggleTheme,
  openWorkspaceSwitcher,
  trackRecentNote,
  chooseLocalVault,
  copyNoteLink,
  copyNoteMarkdownLink,
  duplicateNote,
  openMoveNotePicker,
  openShare,
  reorderTab,
  revealLocalNote,
  revealLocalVault,
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
    aiAssist: bumpAiAssistRequest,
    dictate: bumpDictateRequest,
    findInNote: bumpEditorSearchRequest,
    focusEditor: () => focusZone('editor'),
    focusInspector: () => focusZone('inspector'),
    focusNavigator: () => focusZone('navigator'),
    focusNextPane: () => {
      focusNextPane();
      focusZone('editor', { afterMove: true });
    },
    focusNextTab: () => {
      focusNextTab();
      focusZone('editor', { afterMove: true });
    },
    focusPreviousPane: () => {
      focusPreviousPane();
      focusZone('editor', { afterMove: true });
    },
    focusPreviousTab: () => {
      focusPreviousTab();
      focusZone('editor', { afterMove: true });
    },
    openWorkspaceSwitcher,
    focusWorkspaceSearch,
    goHistory: () => {
      switchToHistory();
      focusZone('navigator');
    },
    importMarkdownNote,
    moveTabToOtherPane: () => {
      moveActiveTabToOtherPane();
      focusZone('editor', { afterMove: true });
    },
    navigateBack: () => {
      navigateBack();
      focusZone('editor');
    },
    navigateForward: () => {
      navigateForward();
      focusZone('editor');
    },
    openKeyboardShortcuts,
    openLeaderMenu,
    toggleHackMode,
    openViewOptions,
    focusNextRegion,
    openPalette,
    openQuickOpen,
    openSelectedWebEditor: () => openHackmdWebEditor(api, selectedDocument, trackRecentNote),
    openSettings: () => setSettingsOpen(true),
    createNoteFromTemplate,
    askNotes,
    saveAsTemplate,
    openAsBook: () => {
      if (selectedDocument) book.open(selectedDocument);
    },
    presentNote: () => {
      if (activeTab) void api?.app.openPresentation?.({ title: documentTitle, content: documentContent });
    },
    openAdjacentChapter: (step) => {
      const position = book.positionOf(selectedDocument);
      if (!position) {
        toast.info('Open a book and one of its chapters first.');
        return;
      }
      book.openChapter((position.chapterIndex ?? -1) + step);
    },
    showNoteVersions: () => {
      if (!selectedDocument || selectedDocument.teamPath === LOCAL_VAULT_TEAM_PATH) {
        toast.info('Version history is only available for HackMD notes.');
        return;
      }
      setVersionsOpen(true);
    },
    refreshWorkspace,
    showTrash: () => setTrashOpen(true),
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
      if (activeTab && isDraftNoteTab(activeTab) && !isSavingNote) {
        saveDraftNote(activeTab, { title: documentTitle, content: documentContent });
        return;
      }

      if (selectedDocument && noteDirty && !isSavingNote) {
        saveNote(selectedDocument, { title: documentTitle, content: documentContent });
      }
    },
    setEditorMode,
    splitPaneRight: () => {
      splitActiveTab();
      focusZone('editor', { afterMove: true });
    },
    splitPaneDown: () => {
      splitActivePaneDown();
      focusZone('editor', { afterMove: true });
    },
    focusPaneInDirection: (direction) => {
      focusPaneToward(direction);
      focusZone('editor', { afterMove: true });
    },
    togglePaneZoom,
    equalizePanes,
    toggleInspector,
    toggleKeyHints,
    toggleNavigator,
    toggleTheme,
    // The active pane opens its Rename Note dialog.
    renameNote: bumpRenameRequest,
    duplicateSelectedNote: () => {
      if (selectedDocument) duplicateNote(selectedDocument);
    },
    moveNoteToFolder: openMoveNotePicker,
    revealNoteInFinder: () => {
      if (selectedDocument) revealLocalNote(selectedDocument);
    },
    copyNoteLink: () => {
      if (selectedDocument) copyNoteLink(selectedDocument);
    },
    copyMarkdownLink: () => {
      if (selectedDocument) copyNoteMarkdownLink(selectedDocument);
    },
    shareNote: openShare,
    moveTab: (step) => {
      const index = activeTab ? activePaneTabIds.indexOf(activeTab.tabId) : -1;
      const overTabId = index >= 0 ? activePaneTabIds[index + step] : undefined;
      if (activeTab && overTabId) reorderTab(activePaneId, activeTab.tabId, overTabId);
    },
    toggleBookContents: book.toggleContents,
    closeBook: book.close,
    changeLocalVault: chooseLocalVault,
    revealVaultInFinder: () => {
      void revealLocalVault().catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to reveal the local vault.');
      });
    },
    clearOfflineCopies: () => clearOfflineCopies(api),
  }), [
    activePaneId,
    activeTab,
    api,
    book,
    bumpAttachImageRequest,
    bumpRenameRequest,
    bumpAiAssistRequest,
    bumpDictateRequest,
    bumpEditorSearchRequest,
    createFolder,
    createNote,
    createNoteFromTemplate,
    askNotes,
    saveAsTemplate,
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
    openKeyboardShortcuts,
    openLeaderMenu,
    toggleHackMode,
    openViewOptions,
    focusNextRegion,
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
    saveDraftNote,
    setEditorMode,
    selectedDocument,
    selectedFolderId,
    setSettingsOpen,
    setTrashOpen,
    setVersionsOpen,
    splitActiveTab,
    switchToHistory,
    toggleInspector,
    toggleKeyHints,
    toggleNavigator,
    toggleTheme,
    openWorkspaceSwitcher,
    trackRecentNote,
    activePaneTabIds,
    chooseLocalVault,
    copyNoteLink,
    copyNoteMarkdownLink,
    duplicateNote,
    openMoveNotePicker,
    openShare,
    reorderTab,
    revealLocalNote,
    revealLocalVault,
  ]);
}
