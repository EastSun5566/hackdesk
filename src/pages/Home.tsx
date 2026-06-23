import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTheme } from '@/components/theme-provider';
import { getDesktopAPI } from '@/lib/desktop-api';
import type {
  DocumentSummary,
  FolderSummary,
  NoteSummary,
} from '@/lib/electron-api';
import {
  applyNoteFinder,
} from '@/lib/electron-note-finder';
import type { QuickOpenFolderResult, QuickOpenWorkspaceResult } from '@/lib/electron-quick-open';
import {
  readRecentNotes,
  recentNoteMatches,
  removeRecentNote,
  upsertRecentNote,
  writeRecentNotes,
  type ElectronRecentNote,
} from '@/lib/electron-recent-notes';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID, type FolderTreeNode, type FolderTreeNote } from '@/lib/hackmd-folders';

import { AppTopBar } from './electron-home/AppTopBar';
import { CommandPaletteDialog } from './electron-home/CommandPaletteDialog';
import { CreateFolderDialog } from './electron-home/CreateFolderDialog';
import { CreateNoteDialog } from './electron-home/CreateNoteDialog';
import { DeleteNoteDialog } from './electron-home/DeleteNoteDialog';
import { DeleteFolderDialog } from './electron-home/DeleteFolderDialog';
import { DocumentWorkspace } from './electron-home/DocumentWorkspace';
import { FolderNavigator } from './electron-home/FolderNavigator';
import { PanelResizeSash } from './electron-home/PanelResizeSash';
import { SettingsDialog } from './electron-home/SettingsDialog';
import { RenameFolderDialog } from './electron-home/RenameFolderDialog';
import { WorkspaceRail } from './electron-home/WorkspaceRail';
import {
  getRepositoryError,
  getScopeStorageKey,
  isShowingCachedFallback,
} from './electron-home/repository';
import {
  noteIdentityMatches,
  type NoteIdentity,
} from './electron-home/note-workspace';
import type {
  CommandPaletteState,
  CreateFolderDialogState,
  CreateNoteDialogState,
  RenameFolderDialogState,
  WorkspaceScope,
} from './electron-home/types';
import {
  FOLDER_COLLAPSED_PREFIX,
  INSPECTOR_COLLAPSED_KEY,
  LAST_WORKSPACE_SCOPE_KEY,
  NAVIGATOR_COLLAPSED_KEY,
  NAVIGATOR_WIDTH_DEFAULT,
  NAVIGATOR_WIDTH_KEY,
  NAVIGATOR_WIDTH_MAX,
  NAVIGATOR_WIDTH_MIN,
  READER_MODE_KEY,
  RAIL_COLLAPSED_KEY,
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_KEY,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
  readBooleanStorage,
  readNumberStorage,
  readReaderModeStorage,
  readStringArrayStorage,
  readWorkspaceScopeStorage,
  writeBooleanStorage,
  writeNumberStorage,
  writeReaderModeStorage,
  writeStringArrayStorage,
  writeWorkspaceScopeStorage,
  type ReaderMode,
} from './electron-home/ui-preferences';
import {
  getFolderNoteEntries,
  getFolderPathLabel,
} from './electron-home/ui';
import { useElectronHackmdQueries } from './electron-home/useElectronHackmdQueries';
import { useElectronFocusZones } from './electron-home/useElectronFocusZones';
import { useElectronNoteMutations } from './electron-home/useElectronNoteMutations';
import { useDocumentCommands } from './electron-home/useDocumentCommands';
import { useNoteWorkspaceTabs } from './electron-home/useNoteWorkspaceTabs';
import {
  exportDebugLogs,
  openHackmdWebEditor,
  useWorkbenchActions,
  type WorkbenchActionHandlers,
} from './electron-home/useWorkbenchActions';
import { useWorkbenchClosePolicy } from './electron-home/useWorkbenchClosePolicy';
import { useWorkbenchDocuments } from './electron-home/useWorkbenchDocuments';
import { useWorkbenchFinder } from './electron-home/useWorkbenchFinder';
import { useWorkbenchShortcuts } from './electron-home/useWorkbenchShortcuts';
import { useWorkbenchTabLifecycle } from './electron-home/useWorkbenchTabLifecycle';

const WORKSPACE_RAIL_PANEL_ID = 'workspace-rail-panel';
const NOTE_NAVIGATOR_PANEL_ID = 'note-navigator-panel';
const DEFAULT_WORKSPACE_SCOPE: WorkspaceScope = { type: 'personal', label: 'My Workspace' };

function createClosedFolderDialogState(): CreateFolderDialogState {
  return { open: false, name: '', description: '', icon: '', color: '' };
}

function createClosedRenameFolderDialogState(): RenameFolderDialogState {
  return { open: false, folderId: null, name: '', description: '', icon: '', color: '' };
}

export function Home() {
  const { resolvedMode, setTheme } = useTheme();
  const api = getDesktopAPI();
  const initialWorkspaceScope = readWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, DEFAULT_WORKSPACE_SCOPE);
  const initialScopeStorageKey = getScopeStorageKey(initialWorkspaceScope);
  const [scope, setScopeState] = useState<WorkspaceScope>(() => initialWorkspaceScope);
  const scopeStorageKey = useMemo(() => getScopeStorageKey(scope), [scope]);
  const noteWorkspace = useNoteWorkspaceTabs(scopeStorageKey);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [recentNotes, setRecentNotes] = useState<ElectronRecentNote[]>(() => readRecentNotes(window.localStorage));
  const pendingRecentNoteRef = useRef<ElectronRecentNote | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [palette, setPalette] = useState<CommandPaletteState>({ open: false, search: '' });
  const [createDialog, setCreateDialog] = useState<CreateNoteDialogState>({ open: false, title: '' });
  const [createFolderDialog, setCreateFolderDialog] = useState<CreateFolderDialogState>(createClosedFolderDialogState);
  const [renameFolderDialog, setRenameFolderDialog] = useState<RenameFolderDialogState>(createClosedRenameFolderDialogState);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderTreeNode | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => readBooleanStorage(INSPECTOR_COLLAPSED_KEY, true));
  const [readerMode, setReaderModeState] = useState<ReaderMode>(() => readReaderModeStorage(READER_MODE_KEY, 'edit'));
  const [editorSearchRequestId, setEditorSearchRequestId] = useState(0);
  const [railCollapsed, setRailCollapsed] = useState(() => readBooleanStorage(RAIL_COLLAPSED_KEY, false));
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(() => readBooleanStorage(NAVIGATOR_COLLAPSED_KEY, false));
  const [railWidth, setRailWidth] = useState(() => (
    readNumberStorage(RAIL_WIDTH_KEY, RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX)
  ));
  const [navigatorWidth, setNavigatorWidth] = useState(() => (
    readNumberStorage(NAVIGATOR_WIDTH_KEY, NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MIN, NAVIGATOR_WIDTH_MAX)
  ));
  const autoSelectSuppressionRef = useRef<string | null>(null);
  const manualEmptyWorkspaceRef = useRef(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => (
    readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${initialScopeStorageKey}`)
  ));
  const {
    activeFinderState,
    deferredFinderState,
    finderActive,
    focusWorkspaceSearch,
    loadFinderStateForScope,
    setFinderState,
  } = useWorkbenchFinder({
    initialScopeStorageKey,
    scopeStorageKey,
    selectedFolderId,
    setNavigatorCollapsed,
  });
  const { focusZone } = useElectronFocusZones();
  const selectedNote = useMemo<NoteIdentity | null>(() => (
    noteWorkspace.activeTab
      ? { id: noteWorkspace.activeTab.noteId, teamPath: noteWorkspace.activeTab.teamPath }
      : null
  ), [noteWorkspace.activeTab]);
  const openNoteInWorkspace = noteWorkspace.openNote;

  const setWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    const nextScopeStorageKey = getScopeStorageKey(nextScope);
    manualEmptyWorkspaceRef.current = false;
    setScopeState(nextScope);
    writeWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, nextScope);
    setCollapsedFolderIds(readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${nextScopeStorageKey}`));
    setSelectedFolderId(null);
    loadFinderStateForScope(nextScopeStorageKey);
  }, [loadFinderStateForScope]);

  const {
    settings,
    hasToken,
    user,
    teams,
    currentNotes,
    currentFolders,
    currentFolderOrder,
    documentsByKey,
    documentQueries,
    queries,
  } = useElectronHackmdQueries({
    api,
    scope,
    selectedNote,
    activeDocumentNotes: noteWorkspace.visibleActiveTabs.map((tab) => ({
      id: tab.noteId,
      teamPath: tab.teamPath,
    })),
  });

  const displayScope = useMemo<WorkspaceScope>(() => {
    if (scope.type !== 'team') {
      return scope;
    }

    const team = teams.find((candidate) => candidate.path === scope.teamPath);
    return team && team.name !== scope.label
      ? { type: 'team', label: team.name, teamPath: team.path }
      : scope;
  }, [scope, teams]);

  const folderTree = useMemo(
    () => buildHackmdFolderTree(currentNotes, currentFolders, currentFolderOrder),
    [currentFolderOrder, currentFolders, currentNotes],
  );
  const syncOpenNoteSummaries = noteWorkspace.syncNoteSummaries;
  useEffect(() => {
    syncOpenNoteSummaries(currentNotes);
  }, [currentNotes, syncOpenNoteSummaries]);
  const visibleEntries = useMemo(() => {
    const entries = finderActive
      ? applyNoteFinder(folderTree, deferredFinderState, selectedFolderId)
      : getFolderNoteEntries(folderTree, selectedFolderId);

    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = entry.note.id;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [deferredFinderState, finderActive, folderTree, selectedFolderId]);
  const selectedFolder = selectedFolderId === UNFILED_FOLDER_ID
    ? folderTree.unfiled
    : selectedFolderId ? folderTree.nodesById.get(selectedFolderId) ?? null : null;
  const selectedFolderLabel = selectedFolder ? getFolderPathLabel(selectedFolder.folderPath) : null;
  const selectedParentFolderId = selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID ? selectedFolderId : undefined;
  const canCreate = hasToken && scope.type !== 'history';
  const canModifySelectedFolder = Boolean(selectedFolder?.id && selectedFolder.id !== UNFILED_FOLDER_ID);
  const activeTab = noteWorkspace.activeTab;

  const toggleRailCollapsed = useCallback(() => {
    setRailCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(RAIL_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const toggleNavigatorCollapsed = useCallback(() => {
    setNavigatorCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(NAVIGATOR_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const toggleInspectorCollapsed = useCallback(() => {
    setInspectorCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(INSPECTOR_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const expandNavigator = useCallback(() => {
    setNavigatorCollapsed(false);
    writeBooleanStorage(NAVIGATOR_COLLAPSED_KEY, false);
  }, []);

  const revealFolderIds = useCallback((folderIds: string[]) => {
    if (folderIds.length === 0) {
      return;
    }

    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      folderIds.forEach((folderId) => next.delete(folderId));
      return next;
    });
  }, []);

  const setReaderMode = useCallback((mode: ReaderMode) => {
    setReaderModeState(mode);
    writeReaderModeStorage(READER_MODE_KEY, mode);
  }, []);

  const updateRecentNotes = useCallback((updater: (current: ElectronRecentNote[]) => ElectronRecentNote[]) => {
    setRecentNotes((current) => {
      const next = updater(current);
      writeRecentNotes(window.localStorage, next);
      return next;
    });
  }, []);

  const trackRecentNote = useCallback((note: NoteSummary) => {
    updateRecentNotes((current) => upsertRecentNote(current, note));
  }, [updateRecentNotes]);

  const removeRecentNoteEntry = useCallback((noteId: string, teamPath: string | null) => {
    updateRecentNotes((current) => removeRecentNote(current, noteId, teamPath));
  }, [updateRecentNotes]);

  const getAutoSelectSuppressionKey = useCallback((note: NoteSummary | null) => [
    scopeStorageKey,
    selectedFolderId ?? 'workspace',
    selectedNote?.id ?? 'none',
    note?.id ?? 'none',
  ].join(':'), [scopeStorageKey, selectedFolderId, selectedNote?.id]);

  const requestSelectNote = useCallback(async (
    note: NoteSummary,
    options: { focusEditor?: boolean; trackRecent?: boolean } = {},
  ) => {
    autoSelectSuppressionRef.current = null;
    manualEmptyWorkspaceRef.current = false;
    openNoteInWorkspace(note);
    if (options.trackRecent ?? true) {
      trackRecentNote(note);
    }

    if (options.focusEditor) {
      window.requestAnimationFrame(() => focusZone('editor'));
    }

    return true;
  }, [focusZone, openNoteInWorkspace, trackRecentNote]);

  const handleNoteSelect = useCallback((note: NoteSummary) => {
    void requestSelectNote(note, { trackRecent: true });
  }, [requestSelectNote]);

  const mutations = useElectronNoteMutations({
    api,
    scope,
    selectedNote,
    selectedParentFolderId,
    onSettingsSaved: () => setSettingsOpen(false),
    onNoteCreated: (note) => {
      setCreateDialog({ open: false, title: '' });
      void requestSelectNote(note, { trackRecent: true });
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
    saveFailedNote: mutations.updateNoteMutation.isError
      ? mutations.updateNoteMutation.variables?.note ?? null
      : null,
    savingNote: mutations.updateNoteMutation.variables?.note ?? null,
    tabs: noteWorkspace.state.tabs,
    updateDraft: noteWorkspace.updateDraft,
    uploadingNote: mutations.uploadNoteImageMutation.variables?.note ?? null,
  });

  const refreshWorkspace = useCallback(() => {
    void queries.userQuery.refetch();
    void queries.teamsQuery.refetch();
    void queries.notesQuery.refetch();
    if (scope.type !== 'history') {
      void queries.foldersQuery.refetch();
      void queries.folderOrderQuery.refetch();
    }
  }, [queries.folderOrderQuery, queries.foldersQuery, queries.notesQuery, queries.teamsQuery, queries.userQuery, scope.type]);

  const handleCreateNote = useCallback(() => {
    if (!hasToken) {
      setSettingsOpen(true);
      return;
    }

    if (scope.type === 'history') {
      toast.info('Choose My Workspace or a team before creating a note.');
      return;
    }

    setCreateDialog({ open: true, title: '' });
  }, [hasToken, scope.type]);

  const handleCreateFolder = useCallback(() => {
    if (!hasToken) {
      setSettingsOpen(true);
      return;
    }

    if (scope.type === 'history') {
      toast.info('Choose My Workspace or a team before creating a folder.');
      return;
    }

    setCreateFolderDialog({ ...createClosedFolderDialogState(), open: true });
  }, [hasToken, scope.type]);

  const handleCreateFolderInside = useCallback((folderId: string | null) => {
    if (folderId) {
      setSelectedFolderId(folderId);
    } else {
      setSelectedFolderId(UNFILED_FOLDER_ID);
    }

    handleCreateFolder();
  }, [handleCreateFolder]);

  const handleRenameFolder = useCallback((folderId: string) => {
    const folder = folderTree.nodesById.get(folderId);
    if (!folder) {
      toast.info('Select a folder before renaming it.');
      return;
    }

    const folderSummary = currentFolders.find((candidate) => candidate.id === folderId);
    setRenameFolderDialog({
      open: true,
      folderId,
      name: folder.name,
      description: folderSummary?.description ?? '',
      icon: folder.icon ?? '',
      color: folder.color ?? '',
    });
  }, [currentFolders, folderTree]);

  const handleDeleteFolderRequest = useCallback((folderId: string) => {
    const folder = folderTree.nodesById.get(folderId);
    if (!folder) {
      toast.info('Select a folder before deleting it.');
      return;
    }

    if (!api?.app.confirm) {
      setDeleteFolderTarget(folder);
      return;
    }

    api.app.confirm({
      title: 'Delete Folder',
      message: `Delete “${folder.name}”?`,
      detail: 'This removes the folder from HackMD. This action cannot be undone from HackDesk.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    }).then(({ confirmed }) => {
      if (confirmed) {
        mutations.deleteFolderMutation.mutate({ folderId: folder.id, parentFolderId: folder.parentId });
      }
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm folder deletion.');
    });
  }, [api, folderTree, mutations.deleteFolderMutation]);

  const handleFolderDrop = useCallback((operation: FolderDropOperation) => {
    mutations.moveFolderMutation.mutate(operation);
  }, [mutations.moveFolderMutation]);

  const openPalette = useCallback(() => {
    setPalette({ open: true, search: '' });
  }, []);

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

  const revealNoteEntry = useCallback(async (entry: FolderTreeNote) => {
    const folderIds = entry.folderPath.map((folder) => folder.id);
    const leafFolderId = folderIds.at(-1) ?? UNFILED_FOLDER_ID;
    if (!await requestSelectNote(entry.note, {
      focusEditor: true,
      trackRecent: true,
    })) {
      return false;
    }

    expandNavigator();
    revealFolderIds(folderIds);
    setSelectedFolderId(leafFolderId);
    return true;
  }, [expandNavigator, requestSelectNote, revealFolderIds]);

  useEffect(() => {
    writeStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`, collapsedFolderIds);
  }, [collapsedFolderIds, scopeStorageKey]);

  useEffect(() => {
    if (selectedNote && visibleEntries.some((entry) => noteIdentityMatches(entry.note, selectedNote))) {
      autoSelectSuppressionRef.current = null;
      return;
    }

    const nextNote = visibleEntries[0]?.note ?? null;
    if (!nextNote) {
      autoSelectSuppressionRef.current = null;
      return;
    }

    if (selectedNote) {
      return;
    }

    if (manualEmptyWorkspaceRef.current) {
      return;
    }

    const suppressionKey = getAutoSelectSuppressionKey(nextNote);
    if (autoSelectSuppressionRef.current === suppressionKey) {
      return;
    }

    void requestSelectNote(nextNote, { trackRecent: false }).then((selected) => {
      if (!selected) {
        autoSelectSuppressionRef.current = suppressionKey;
      }
    });
  }, [getAutoSelectSuppressionKey, requestSelectNote, selectedNote, visibleEntries]);

  useEffect(() => {
    const pendingRecentNote = pendingRecentNoteRef.current;
    if (!pendingRecentNote) {
      return;
    }

    const currentTeamPath = scope.type === 'team' ? scope.teamPath : null;
    const isTargetScopeLoaded = scope.type !== 'history' && currentTeamPath === pendingRecentNote.teamPath;
    if (!isTargetScopeLoaded || queries.notesQuery.isLoading || queries.notesQuery.isFetching) {
      return;
    }

    const loadedEntry = folderTree.allNotes.find((candidate) => recentNoteMatches(candidate.note, pendingRecentNote));
    pendingRecentNoteRef.current = null;
    if (loadedEntry) {
      void revealNoteEntry(loadedEntry);
      return;
    }

    removeRecentNoteEntry(pendingRecentNote.noteId, pendingRecentNote.teamPath);
    toast.info(`“${pendingRecentNote.title || 'Untitled'}” is no longer available in this workspace.`);
  }, [
    folderTree.allNotes,
    queries.notesQuery.isFetching,
    queries.notesQuery.isLoading,
    removeRecentNoteEntry,
    revealNoteEntry,
    scope,
  ]);

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

  const actionHandlers = useMemo<WorkbenchActionHandlers>(() => ({
    closeActiveTab: () => {
      if (activeTab) {
        void requestCloseTab(activeTab.tabId);
      }
    },
    closeOtherTabs: () => {
      if (activeTab) {
        void requestCloseOtherTabs(noteWorkspace.state.activePaneId, activeTab.tabId);
      }
    },
    closeTabsToRight: () => {
      if (activeTab) {
        void requestCloseTabsToRight(noteWorkspace.state.activePaneId, activeTab.tabId);
      }
    },
    createFolder: handleCreateFolder,
    createNote: handleCreateNote,
    deleteSelectedFolder: () => {
      if (selectedFolder?.id && selectedFolder.id !== UNFILED_FOLDER_ID) {
        handleDeleteFolderRequest(selectedFolder.id);
      } else {
        toast.info('Select a folder before deleting it.');
      }
    },
    deleteSelectedNote: () => {
      if (selectedDocument) {
        handleDeleteRequest(selectedDocument);
      }
    },
    duplicateActiveTab: noteWorkspace.duplicateActiveTab,
    exportDebugLogs: () => exportDebugLogs(api),
    exportSelectedMarkdown: () => {
      if (selectedDocument) {
        handleExportMarkdown(selectedDocument, documentTitle, documentContent);
      }
    },
    findInNote: () => {
      setReaderMode('edit');
      setEditorSearchRequestId((current) => current + 1);
    },
    focusEditor: () => focusZone('editor'),
    focusInspector: () => focusZone('inspector'),
    focusNavigator: () => focusZone('navigator'),
    focusNextPane: () => {
      noteWorkspace.focusNextPane();
      focusZone('editor');
    },
    focusNextTab: () => {
      noteWorkspace.focusNextTab();
      focusZone('editor');
    },
    focusPreviousPane: () => {
      noteWorkspace.focusPreviousPane();
      focusZone('editor');
    },
    focusPreviousTab: () => {
      noteWorkspace.focusPreviousTab();
      focusZone('editor');
    },
    focusWorkspace: () => focusZone('workspace'),
    focusWorkspaceSearch,
    goHistory: () => {
      pendingRecentNoteRef.current = null;
      setWorkspaceScope({ type: 'history', label: 'History' });
      focusZone('navigator');
    },
    importMarkdownNote: handleImportMarkdownNote,
    moveTabToOtherPane: () => {
      noteWorkspace.moveActiveTabToOtherPane();
      focusZone('editor');
    },
    openPalette,
    openSelectedWebEditor: () => openHackmdWebEditor(api, selectedDocument, trackRecentNote),
    openSettings: () => setSettingsOpen(true),
    refreshWorkspace,
    renameSelectedFolder: () => {
      if (selectedFolder?.id && selectedFolder.id !== UNFILED_FOLDER_ID) {
        handleRenameFolder(selectedFolder.id);
      } else {
        toast.info('Select a folder before renaming it.');
      }
    },
    reopenLastClosedTab: () => {
      noteWorkspace.reopenLastClosed();
      focusZone('editor');
    },
    saveNote: () => {
      if (selectedDocument && noteDirty && !mutations.updateNoteMutation.isPending) {
        mutations.updateNoteMutation.mutate({
          note: selectedDocument,
          input: { title: documentTitle, content: documentContent },
        });
      }
    },
    splitPaneRight: () => {
      noteWorkspace.splitActiveTab();
      focusZone('editor');
    },
    toggleInspector: toggleInspectorCollapsed,
    toggleNavigator: toggleNavigatorCollapsed,
    toggleReaderMode: () => setReaderMode(readerMode === 'read' ? 'edit' : 'read'),
    toggleTheme: () => setTheme(resolvedMode === 'dark' ? 'light' : 'dark'),
    toggleWorkspaceRail: toggleRailCollapsed,
  }), [
    activeTab,
    api,
    documentContent,
    documentTitle,
    focusZone,
    focusWorkspaceSearch,
    handleCreateFolder,
    handleCreateNote,
    handleDeleteFolderRequest,
    handleDeleteRequest,
    handleExportMarkdown,
    handleImportMarkdownNote,
    handleRenameFolder,
    mutations.updateNoteMutation,
    noteDirty,
    noteWorkspace,
    openPalette,
    readerMode,
    refreshWorkspace,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
    resolvedMode,
    selectedDocument,
    selectedFolder,
    setReaderMode,
    setTheme,
    setWorkspaceScope,
    toggleInspectorCollapsed,
    toggleNavigatorCollapsed,
    toggleRailCollapsed,
    trackRecentNote,
  ]);

  const { actionContext, runAction } = useWorkbenchActions({
    canCreate,
    canModifySelectedFolder,
    hasActiveTab: Boolean(activeTab),
    handlers: actionHandlers,
    hasToken,
    inspectorCollapsed,
    isSavingNote: mutations.updateNoteMutation.isPending,
    navigatorCollapsed,
    noteDirty,
    readerMode,
    scopeType: scope.type,
    selectedFolderId,
    selectedNoteId: selectedNote?.id ?? null,
    workspaceRailCollapsed: railCollapsed,
    workspaceState: noteWorkspace.state,
  });

  const closeTransientLayer = useCallback(() => {
    if (palette.open) {
      setPalette({ open: false, search: '' });
      return true;
    }

    if (shareOpen) {
      setShareOpen(false);
      return true;
    }

    if (createDialog.open) {
      setCreateDialog({ open: false, title: '' });
      return true;
    }

    if (createFolderDialog.open) {
      setCreateFolderDialog(createClosedFolderDialogState());
      return true;
    }

    if (deleteTarget) {
      setDeleteTarget(null);
      return true;
    }

    if (deleteFolderTarget) {
      setDeleteFolderTarget(null);
      return true;
    }

    if (renameFolderDialog.open) {
      setRenameFolderDialog(createClosedRenameFolderDialogState());
      return true;
    }

    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }

    return false;
  }, [
    createDialog.open,
    createFolderDialog.open,
    deleteFolderTarget,
    deleteTarget,
    palette.open,
    renameFolderDialog.open,
    settingsOpen,
    shareOpen,
  ]);

  useWorkbenchClosePolicy({
    activeTab,
    api,
    closeTransientLayer,
    confirmCloseUnsafeTabs,
    openTabs: noteWorkspace.state.tabs,
    requestCloseTab,
  });

  useEffect(() => {
    return api?.app.onCommand((command) => {
      runAction(command.type);
    });
  }, [api, runAction]);

  useWorkbenchShortcuts({
    activeFinderState,
    closeTransientLayer,
    focusTabAtIndex,
    handleCreateNote,
    noteDirty,
    openPalette,
    refreshWorkspace,
    runAction,
    selectedFolderId,
    setFinderState,
    setSelectedFolderId,
  });

  if (!api) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background-muted text-sm text-text-subtle">
        Electron API is unavailable.
      </div>
    );
  }

  const notesError = getRepositoryError(queries.notesQuery.data);
  const foldersError = getRepositoryError(queries.foldersQuery.data);
  const folderOrderError = getRepositoryError(queries.folderOrderQuery.data);
  const userError = getRepositoryError(queries.userQuery.data);
  const teamsError = getRepositoryError(queries.teamsQuery.data);
  const activeError = notesError ?? foldersError ?? folderOrderError ?? userError ?? teamsError;
  const showingCachedFallback =
    isShowingCachedFallback(queries.notesQuery.data)
    || isShowingCachedFallback(queries.foldersQuery.data)
    || isShowingCachedFallback(queries.folderOrderQuery.data)
    || isShowingCachedFallback(queries.userQuery.data)
    || isShowingCachedFallback(queries.teamsQuery.data);
  const emptyTitle = !hasToken
    ? 'Connect HackMD first'
    : finderActive
      ? 'No matching notes'
      : scope.type === 'history'
        ? 'No history yet'
        : selectedFolder
          ? 'No notes in this folder'
          : 'No notes in this workspace';
  const emptyDescription = !hasToken
    ? 'Add an API token in Settings to load your profile, teams, notes, and history.'
    : finderActive
      ? 'Try a different title, tag, folder path, short ID, team path, sort, or filter.'
      : scope.type === 'history'
        ? 'Your HackMD history will appear here after the first successful sync.'
        : 'Select another folder, create a note here, or refresh after another client changes HackMD.';
  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };
  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);

    if (folderId && folderId !== UNFILED_FOLDER_ID) {
      setCollapsedFolderIds((current) => {
        if (!current.has(folderId)) {
          return current;
        }

        const next = new Set(current);
        next.delete(folderId);
        return next;
      });
    }
  };

  const handleQuickOpenNote = (entry: FolderTreeNote) => {
    void revealNoteEntry(entry);
  };

  const handleQuickOpenRecentNote = (entry: ElectronRecentNote) => {
    const loadedEntry = folderTree.allNotes.find((candidate) => (
      recentNoteMatches(candidate.note, entry)
    ));

    if (loadedEntry) {
      pendingRecentNoteRef.current = null;
      void revealNoteEntry(loadedEntry);
      return;
    }

    const currentTeamPath = scope.type === 'team' ? scope.teamPath : null;
    const isCurrentWritableScope = scope.type !== 'history' && currentTeamPath === entry.teamPath;
    if (isCurrentWritableScope && !queries.notesQuery.isLoading && !queries.notesQuery.isFetching) {
      removeRecentNoteEntry(entry.noteId, entry.teamPath);
      toast.info(`“${entry.title || 'Untitled'}” is no longer available in this workspace.`);
      return;
    }

    if (entry.teamPath) {
      const team = teams.find((candidate) => candidate.path === entry.teamPath);
      pendingRecentNoteRef.current = entry;
      setWorkspaceScope({
        type: 'team',
        label: team?.name ?? entry.teamPath,
        teamPath: entry.teamPath,
      });
      toast.info(`Loading ${team?.name ?? entry.teamPath} before opening “${entry.title || 'Untitled'}”.`);
      focusZone('navigator');
      return;
    }

    pendingRecentNoteRef.current = entry;
    setWorkspaceScope({ type: 'personal', label: 'My Workspace' });
    toast.info(`Loading My Workspace before opening “${entry.title || 'Untitled'}”.`);
    focusZone('navigator');
  };

  const handleQuickOpenWorkspace = (workspace: QuickOpenWorkspaceResult) => {
    pendingRecentNoteRef.current = null;
    if (workspace.type === 'personal') {
      setWorkspaceScope({ type: 'personal', label: workspace.label });
    } else if (workspace.type === 'history') {
      setWorkspaceScope({ type: 'history', label: workspace.label });
    } else {
      setWorkspaceScope({ type: 'team', label: workspace.label, teamPath: workspace.teamPath });
    }

    focusZone('navigator');
  };

  const handleQuickOpenFolder = (folder: QuickOpenFolderResult) => {
    expandNavigator();
    revealFolderIds([...folder.ancestorIds, folder.id]);
    setSelectedFolderId(folder.id);
    focusZone('navigator');
  };

  const handleShowFinderResults = (query: string) => {
    expandNavigator();
    setFinderState((current) => ({
      ...current,
      query,
      searchScope: 'workspace',
    }));
    focusZone('navigator');
  };

  return (
    <div className="app-chrome flex h-dvh flex-col overflow-hidden bg-background-muted text-text-default">
      <AppTopBar
        railCollapsed={railCollapsed}
        railPanelId={WORKSPACE_RAIL_PANEL_ID}
        onToggleRail={toggleRailCollapsed}
      />

      <main className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceRail
          id={WORKSPACE_RAIL_PANEL_ID}
          scope={displayScope}
          user={user}
          teams={teams}
          collapsed={railCollapsed}
          width={railWidth}
          onScopeChange={(nextScope) => {
            pendingRecentNoteRef.current = null;
            setWorkspaceScope(nextScope);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <PanelResizeSash
          label="Resize workspace sidebar"
          value={railWidth}
          min={RAIL_WIDTH_MIN}
          max={RAIL_WIDTH_MAX}
          defaultValue={RAIL_WIDTH_DEFAULT}
          disabled={railCollapsed}
          onChange={(value) => {
            setRailWidth(value);
            writeNumberStorage(RAIL_WIDTH_KEY, value);
          }}
        />

        <FolderNavigator
          id={NOTE_NAVIGATOR_PANEL_ID}
          scope={displayScope}
          tree={folderTree}
          entries={visibleEntries}
          selectedFolderId={selectedFolderId}
          selectedNoteId={selectedNote?.id ?? null}
          finderState={activeFinderState}
          isLoading={queries.notesQuery.isLoading || queries.foldersQuery.isLoading || queries.folderOrderQuery.isLoading}
          hasToken={hasToken}
          collapsed={navigatorCollapsed}
          width={navigatorWidth}
          collapsedFolderIds={collapsedFolderIds}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          activeError={activeError}
          showingCachedFallback={showingCachedFallback}
          canCreate={canCreate}
          isFetching={queries.notesQuery.isFetching || queries.foldersQuery.isFetching || queries.folderOrderQuery.isFetching}
          isCreating={mutations.createNoteMutation.isPending || mutations.createFolderMutation.isPending}
          isMovingFolder={mutations.moveFolderMutation.isPending}
          isMovingNote={mutations.moveNoteMutation.isPending}
          onFolderSelect={handleFolderSelect}
          onFolderToggle={toggleFolderCollapsed}
          onNoteSelect={handleNoteSelect}
          onFinderStateChange={setFinderState}
          onRefresh={refreshWorkspace}
          onCreate={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onCreateFolderInside={handleCreateFolderInside}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolderRequest}
          onFolderDrop={handleFolderDrop}
          onNoteMove={(operation) => {
            if (!operation.changed) {
              setSelectedFolderId(operation.targetFolderId ?? UNFILED_FOLDER_ID);
              void requestSelectNote(operation.note.note, { trackRecent: false });
              return;
            }

            mutations.moveNoteMutation.mutate({
              note: operation.note.note,
              targetFolderId: operation.targetFolderId,
            });
          }}
          onOpenNote={handleOpenEditor}
          onCopyNoteLink={handleCopyNoteLink}
          onCopyNoteMarkdownLink={handleCopyNoteMarkdownLink}
          onDuplicateNote={handleDuplicateNote}
          onExportNoteMarkdown={handleExportNoteMarkdown}
          onDeleteNote={handleDeleteRequest}
          onImportMarkdown={handleImportMarkdownNote}
          onToggleCollapsed={toggleNavigatorCollapsed}
          onOpenPalette={openPalette}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <PanelResizeSash
          label="Resize note navigator"
          value={navigatorWidth}
          min={NAVIGATOR_WIDTH_MIN}
          max={NAVIGATOR_WIDTH_MAX}
          defaultValue={NAVIGATOR_WIDTH_DEFAULT}
          disabled={navigatorCollapsed}
          onChange={(value) => {
            setNavigatorWidth(value);
            writeNumberStorage(NAVIGATOR_WIDTH_KEY, value);
          }}
        />

        <DocumentWorkspace
          panes={noteWorkspace.state.panes}
          activePaneId={noteWorkspace.state.activePaneId}
          folderTree={folderTree}
          readerMode={readerMode}
          shareOpen={shareOpen}
          isInspectorCollapsed={inspectorCollapsed}
          getPaneView={getPaneView}
          getPaneTabs={getPaneTabs}
          getTabSyncState={getTabSyncState}
          editorSearchRequestId={editorSearchRequestId}
          canReopenLastClosedTab={noteWorkspace.state.recentlyClosedTabs.length > 0}
          onResizePanes={noteWorkspace.resizePanes}
          onFocusPane={noteWorkspace.focusPane}
          onSelectTab={noteWorkspace.selectTab}
          onCloseTab={requestCloseTab}
          onCloseOtherTabs={requestCloseOtherTabs}
          onCloseTabsToRight={requestCloseTabsToRight}
          onSplitPane={noteWorkspace.splitActiveTab}
          onMoveTabToOtherPane={noteWorkspace.moveActiveTabToOtherPane}
          onReopenLastClosedTab={noteWorkspace.reopenLastClosed}
          onOpenEditor={handleOpenEditor}
          onOpenExternal={handleOpenExternal}
          onCopyLink={handleCopyNoteLink}
          onCopyMarkdownLink={handleCopyNoteMarkdownLink}
          onExportMarkdown={handleExportMarkdown}
          onSave={(note, input) => mutations.updateNoteMutation.mutate({ note, input })}
          onSaveMetadata={(note, input) => mutations.updateNoteMutation.mutate({ note, input })}
          onSaveSharing={(note, input) => mutations.updateNoteMutation.mutate({
            note,
            input,
            successMessage: 'Sharing settings updated.',
          })}
          onUploadImage={(note, input) => mutations.uploadNoteImageMutation.mutateAsync({ note, input })}
          onDelete={handleDeleteRequest}
          onTitleChange={handleDocumentTitleChange}
          onContentChange={handleDocumentContentChange}
          onToggleInspector={toggleInspectorCollapsed}
          onReaderModeChange={setReaderMode}
          onShareOpenChange={setShareOpen}
        />
      </main>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        isSaving={mutations.updateSettingsMutation.isPending}
        onOpenChange={setSettingsOpen}
        onSave={(input) => mutations.updateSettingsMutation.mutate(input)}
        onValidateToken={(token) => {
          if (!api) {
            return Promise.reject(new Error('Electron API is unavailable.'));
          }

          return api.hackmd.validateToken(token);
        }}
      />

      <CommandPaletteDialog
        state={palette}
        context={actionContext}
        folderTree={folderTree}
        recentNotes={recentNotes}
        teams={teams}
        scope={displayScope}
        selectedNoteId={selectedNote?.id ?? null}
        selectedFolderId={selectedFolderId}
        onStateChange={setPalette}
        onRunAction={runAction}
        onSelectNote={handleQuickOpenNote}
        onSelectRecentNote={handleQuickOpenRecentNote}
        onSelectFolder={handleQuickOpenFolder}
        onSelectWorkspace={handleQuickOpenWorkspace}
        onShowFinderResults={handleShowFinderResults}
      />

      <CreateNoteDialog
        state={createDialog}
        scopeLabel={displayScope.label}
        folderLabel={selectedFolderLabel}
        isCreating={mutations.createNoteMutation.isPending}
        onStateChange={setCreateDialog}
        onCreate={(title) => mutations.createNoteMutation.mutate(title)}
      />

      <CreateFolderDialog
        state={createFolderDialog}
        scopeLabel={displayScope.label}
        parentFolderLabel={selectedFolderLabel}
        isCreating={mutations.createFolderMutation.isPending}
        onStateChange={setCreateFolderDialog}
        onCreate={(input) => mutations.createFolderMutation.mutate(input)}
      />

      <RenameFolderDialog
        state={renameFolderDialog}
        isRenaming={mutations.renameFolderMutation.isPending}
        onStateChange={setRenameFolderDialog}
        onRename={(folderId, input) => mutations.renameFolderMutation.mutate({ folderId, input })}
      />

      <DeleteFolderDialog
        folder={deleteFolderTarget}
        isDeleting={mutations.deleteFolderMutation.isPending}
        onCancel={() => setDeleteFolderTarget(null)}
        onDelete={(folder) => mutations.deleteFolderMutation.mutate({
          folderId: folder.id,
          parentFolderId: folder.parentId,
        })}
      />

      <DeleteNoteDialog
        note={deleteTarget}
        isDeleting={mutations.deleteNoteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onDelete={(note) => mutations.deleteNoteMutation.mutate(note)}
      />
    </div>
  );
}
