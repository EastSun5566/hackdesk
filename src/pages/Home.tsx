import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTheme } from '@/components/theme-provider';
import { getDesktopAPI } from '@/lib/desktop-api';
import type {
  DocumentSummary,
  ElectronActionId,
  FolderSummary,
  HackDeskCloseRequest,
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import {
  getActionDisabledReason,
  getElectronAction,
  type ElectronActionContext,
} from '@/lib/electron-actions';
import {
  applyNoteFinder,
  clearNoteFinderFilters,
  clearNoteFinderQuery,
  hasActiveNoteFinderFilters,
  isNoteFinderActive,
  readNoteFinderState,
  writeNoteFinderState,
  type NoteFinderState,
} from '@/lib/electron-note-finder';
import {
  getHackmdNoteUrl,
  getMarkdownNoteLink,
} from '@/lib/electron-note-links';
import {
  buildMarkdownExportInput,
  buildMarkdownImportInput,
} from '@/lib/electron-note-portability';
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
import { type DocumentSyncState } from './electron-home/DocumentDetail';
import { DocumentWorkspace, type DocumentPaneView } from './electron-home/DocumentWorkspace';
import { FolderNavigator } from './electron-home/FolderNavigator';
import { PanelResizeSash } from './electron-home/PanelResizeSash';
import { SettingsDialog } from './electron-home/SettingsDialog';
import { RenameFolderDialog } from './electron-home/RenameFolderDialog';
import { WorkspaceRail } from './electron-home/WorkspaceRail';
import {
  getRepositoryError,
  getScopeStorageKey,
  isShowingCachedFallback,
  unwrapRepositoryValue,
} from './electron-home/repository';
import {
  getNoteIdentityKey,
  getPaneActiveTab,
  noteIdentityMatches,
  type NoteIdentity,
  type NotePane,
  type OpenNoteTab,
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
import { useNoteWorkspaceTabs } from './electron-home/useNoteWorkspaceTabs';

const WORKSPACE_RAIL_PANEL_ID = 'workspace-rail-panel';
const NOTE_NAVIGATOR_PANEL_ID = 'note-navigator-panel';
const DEFAULT_WORKSPACE_SCOPE: WorkspaceScope = { type: 'personal', label: 'My Workspace' };

function createClosedFolderDialogState(): CreateFolderDialogState {
  return { open: false, name: '', description: '', icon: '', color: '' };
}

function createClosedRenameFolderDialogState(): RenameFolderDialogState {
  return { open: false, folderId: null, name: '', description: '', icon: '', color: '' };
}

function createDeleteNoteTarget(note: NoteSummary): DocumentSummary {
  return {
    ...note,
    content: note.content ?? '',
  };
}

async function writeClipboardText(api: HackDeskElectronAPI | undefined, text: string) {
  if (api?.app.writeClipboardText) {
    await api.app.writeClipboardText(text);
    return;
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard is unavailable.');
  }

  await navigator.clipboard.writeText(text);
}

export function Home() {
  const { resolvedMode, setTheme } = useTheme();
  const api = getDesktopAPI();
  const initialWorkspaceScope = readWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, DEFAULT_WORKSPACE_SCOPE);
  const [scope, setScopeState] = useState<WorkspaceScope>(() => initialWorkspaceScope);
  const scopeStorageKey = useMemo(() => getScopeStorageKey(scope), [scope]);
  const noteWorkspace = useNoteWorkspaceTabs(scopeStorageKey);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [recentNotes, setRecentNotes] = useState<ElectronRecentNote[]>(() => readRecentNotes(window.localStorage));
  const pendingRecentNoteRef = useRef<ElectronRecentNote | null>(null);
  const [finderState, setFinderState] = useState<NoteFinderState>(() => (
    readNoteFinderState(window.localStorage, getScopeStorageKey(initialWorkspaceScope))
  ));
  const initialScopeStorageKey = getScopeStorageKey(initialWorkspaceScope);
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
  const [railCollapsed, setRailCollapsed] = useState(() => readBooleanStorage(RAIL_COLLAPSED_KEY, false));
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(() => readBooleanStorage(NAVIGATOR_COLLAPSED_KEY, false));
  const [railWidth, setRailWidth] = useState(() => (
    readNumberStorage(RAIL_WIDTH_KEY, RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX)
  ));
  const [navigatorWidth, setNavigatorWidth] = useState(() => (
    readNumberStorage(NAVIGATOR_WIDTH_KEY, NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MIN, NAVIGATOR_WIDTH_MAX)
  ));
  const skipNextFinderWriteRef = useRef(false);
  const autoSelectSuppressionRef = useRef<string | null>(null);
  const manualEmptyWorkspaceRef = useRef(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => (
    readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${initialScopeStorageKey}`)
  ));
  const { focusZone } = useElectronFocusZones();
  const selectedNote = useMemo<NoteIdentity | null>(() => (
    noteWorkspace.activeTab
      ? { id: noteWorkspace.activeTab.noteId, teamPath: noteWorkspace.activeTab.teamPath }
      : null
  ), [noteWorkspace.activeTab]);
  const openNoteInWorkspace = noteWorkspace.openNote;
  const activeFinderState = useMemo<NoteFinderState>(() => (
    !selectedFolderId && finderState.searchScope === 'current-folder'
      ? { ...finderState, searchScope: 'workspace' }
      : finderState
  ), [finderState, selectedFolderId]);
  const deferredFinderQuery = useDeferredValue(activeFinderState.query);

  const setWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    const nextScopeStorageKey = getScopeStorageKey(nextScope);
    manualEmptyWorkspaceRef.current = false;
    setScopeState(nextScope);
    writeWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, nextScope);
    setCollapsedFolderIds(readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${nextScopeStorageKey}`));
    setSelectedFolderId(null);
    skipNextFinderWriteRef.current = true;
    setFinderState(readNoteFinderState(window.localStorage, nextScopeStorageKey));
  }, []);

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
  const deferredFinderState = useMemo<NoteFinderState>(() => ({
    ...activeFinderState,
    query: deferredFinderQuery,
  }), [activeFinderState, deferredFinderQuery]);
  const finderActive = isNoteFinderActive(deferredFinderState);
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
  const getTabIdentity = useCallback((tab: OpenNoteTab): NoteIdentity => ({
    id: tab.noteId,
    teamPath: tab.teamPath,
  }), []);
  const getTabDocumentResult = useCallback((tab: OpenNoteTab) => (
    documentsByKey.get(getNoteIdentityKey(getTabIdentity(tab)))
  ), [documentsByKey, getTabIdentity]);
  const getTabDocument = useCallback((tab: OpenNoteTab) => {
    const documentResult = unwrapRepositoryValue(getTabDocumentResult(tab));
    return documentResult && noteIdentityMatches(documentResult, getTabIdentity(tab)) ? documentResult : undefined;
  }, [getTabDocumentResult, getTabIdentity]);
  const getTabDraft = useCallback((tab: OpenNoteTab) => noteWorkspace.state.drafts[tab.tabId] ?? null, [noteWorkspace.state.drafts]);
  const getTabTitle = useCallback((tab: OpenNoteTab) => {
    const documentResult = getTabDocument(tab);
    return getTabDraft(tab)?.title ?? documentResult?.title ?? tab.title;
  }, [getTabDocument, getTabDraft]);
  const getTabContent = useCallback((tab: OpenNoteTab) => {
    const documentResult = getTabDocument(tab);
    return getTabDraft(tab)?.content ?? documentResult?.content ?? '';
  }, [getTabDocument, getTabDraft]);
  const isTabDirty = useCallback((tab: OpenNoteTab) => {
    const documentResult = getTabDocument(tab);
    const draft = getTabDraft(tab);
    const baseTitle = documentResult?.title ?? draft?.baseTitle;
    const baseContent = documentResult?.content ?? draft?.baseContent;
    return Boolean(
      draft
      && typeof baseTitle === 'string'
      && typeof baseContent === 'string'
      && (draft.title !== baseTitle || draft.content !== baseContent),
    );
  }, [getTabDocument, getTabDraft]);
  const selectedDocument = activeTab ? getTabDocument(activeTab) : undefined;
  const documentTitle = activeTab ? getTabTitle(activeTab) : '';
  const documentContent = activeTab ? getTabContent(activeTab) : '';
  const noteDirty = activeTab ? isTabDirty(activeTab) : false;

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

  const actionContext = useMemo<ElectronActionContext>(() => ({
    ...(() => {
      const activePane = noteWorkspace.state.panes.find((pane) => pane.paneId === noteWorkspace.state.activePaneId);
      const activeTabIndex = activePane?.activeTabId ? activePane.tabIds.indexOf(activePane.activeTabId) : -1;
      return {
        activePaneTabCount: activePane?.tabIds.length ?? 0,
        activePaneTabsToRightCount: activePane && activeTabIndex >= 0 ? activePane.tabIds.length - activeTabIndex - 1 : 0,
      };
    })(),
    hasToken,
    canCreate,
    scopeType: scope.type,
    selectedFolderId,
    canModifySelectedFolder,
    selectedNoteId: selectedNote?.id ?? null,
    noteDirty,
    isSavingNote: mutations.updateNoteMutation.isPending,
    openTabCount: Object.keys(noteWorkspace.state.tabs).length,
    recentlyClosedTabCount: noteWorkspace.state.recentlyClosedTabs.length,
    paneCount: noteWorkspace.state.panes.length,
    inspectorCollapsed,
    navigatorCollapsed,
    workspaceRailCollapsed: railCollapsed,
    readerMode,
  }), [
    canCreate,
    canModifySelectedFolder,
    hasToken,
    inspectorCollapsed,
    mutations.updateNoteMutation.isPending,
    navigatorCollapsed,
    noteDirty,
    noteWorkspace.state.activePaneId,
    noteWorkspace.state.panes,
    noteWorkspace.state.recentlyClosedTabs.length,
    noteWorkspace.state.tabs,
    railCollapsed,
    readerMode,
    scope.type,
    selectedFolderId,
    selectedNote?.id,
  ]);

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

  const handleExportMarkdown = useCallback((_note: DocumentSummary, title: string, content: string) => {
    if (!api) {
      return;
    }

    void api.app.saveTextFile(buildMarkdownExportInput(title, content))
      .then((filePath) => {
        if (filePath) {
          toast.success(`Note exported to ${filePath}`);
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to export note.');
      });
  }, [api]);

  const handleExportNoteMarkdown = useCallback((note: NoteSummary) => {
    if (!api) {
      return;
    }

    if (noteIdentityMatches(note, selectedNote) && selectedDocument) {
      handleExportMarkdown(selectedDocument, documentTitle, documentContent);
      return;
    }

    void api.hackmd.getNote(note.id, note.teamPath ?? null)
      .then((result) => {
        if (result.source === 'error') {
          throw new Error(result.error);
        }

        return api.app.saveTextFile(buildMarkdownExportInput(result.data.title, result.data.content));
      })
      .then((filePath) => {
        if (filePath) {
          toast.success(`Note exported to ${filePath}`);
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to export note.');
      });
  }, [api, documentContent, documentTitle, handleExportMarkdown, selectedDocument, selectedNote]);

  const handleImportMarkdownNote = useCallback(() => {
    if (!api) {
      return;
    }

    if (scope.type === 'history') {
      toast.info('Choose My Workspace or a team before importing notes.');
      return;
    }

    void api.app.openTextFile({
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    }).then((file) => {
      if (!file) {
        return;
      }

      mutations.importMarkdownNoteMutation.mutate(buildMarkdownImportInput(file, selectedParentFolderId));
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to import markdown note.');
    });
  }, [api, mutations.importMarkdownNoteMutation, scope.type, selectedParentFolderId]);

  const handleDeleteRequest = useCallback((note: NoteSummary) => {
    const deleteNote = createDeleteNoteTarget(note);
    if (!api?.app.confirm) {
      setDeleteTarget(deleteNote);
      return;
    }

    api.app.confirm({
      title: 'Delete Note',
      message: `Delete “${deleteNote.title || 'Untitled'}”?`,
      detail: 'This removes the note from HackMD. This action cannot be undone from HackDesk.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    }).then(({ confirmed }) => {
      if (confirmed) {
        mutations.deleteNoteMutation.mutate(deleteNote);
      }
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm note deletion.');
    });
  }, [api, mutations.deleteNoteMutation]);

  const handleOpenEditor = useCallback((note: NoteSummary) => {
    if (!api) {
      return;
    }

    trackRecentNote(note);
    void Promise.resolve(api.shell.openHackmdEditor(note)).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to open HackMD editor.');
    });
  }, [api, trackRecentNote]);

  const handleOpenExternal = useCallback((url: string) => {
    if (!api) {
      return;
    }

    void Promise.resolve(api.shell.openExternal(url)).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to open link.');
    });
  }, [api]);

  const handleCopyNoteLink = useCallback((note: NoteSummary) => {
    void writeClipboardText(api, getHackmdNoteUrl(note))
      .then(() => toast.success('Link copied.'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy link.'));
  }, [api]);

  const handleCopyNoteMarkdownLink = useCallback((note: NoteSummary) => {
    void writeClipboardText(api, getMarkdownNoteLink(note))
      .then(() => toast.success('Markdown link copied.'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy markdown link.'));
  }, [api]);

  const handleDuplicateNote = useCallback((note: NoteSummary) => {
    mutations.duplicateNoteMutation.mutate(note);
  }, [mutations.duplicateNoteMutation]);

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
    if (skipNextFinderWriteRef.current) {
      skipNextFinderWriteRef.current = false;
      return;
    }

    writeNoteFinderState(window.localStorage, scopeStorageKey, activeFinderState);
  }, [activeFinderState, scopeStorageKey]);

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

  const getTabSyncState = useCallback((tab: OpenNoteTab): DocumentSyncState => {
    const identity = getTabIdentity(tab);
    const documentResult = getTabDocumentResult(tab);
    const documentResultValue = unwrapRepositoryValue(documentResult);
    const documentIsStale = Boolean(documentResultValue && !noteIdentityMatches(documentResultValue, identity));
    const documentQuery = documentQueries.byKey.get(getNoteIdentityKey(identity));
    const isSavingTab = mutations.updateNoteMutation.isPending
      && noteIdentityMatches(mutations.updateNoteMutation.variables?.note, identity);
    const saveFailedTab = mutations.updateNoteMutation.isError
      && noteIdentityMatches(mutations.updateNoteMutation.variables?.note, identity);

    if (documentQuery?.isLoading || documentQuery?.isFetching || documentIsStale) {
      return 'loading';
    }

    if (isSavingTab) {
      return 'saving';
    }

    if (saveFailedTab || (getRepositoryError(documentResult) && !isShowingCachedFallback(documentResult))) {
      return 'save_failed';
    }

    if (isTabDirty(tab)) {
      return 'idle';
    }

    if (isShowingCachedFallback(documentResult)) {
      return 'cached';
    }

    return documentResultValue ? 'saved' : 'idle';
  }, [documentQueries.byKey, getTabDocumentResult, getTabIdentity, isTabDirty, mutations.updateNoteMutation.isError, mutations.updateNoteMutation.isPending, mutations.updateNoteMutation.variables]);

  const handleDocumentTitleChange = useCallback((tab: OpenNoteTab, nextTitle: string) => {
    const documentResult = getTabDocument(tab);
    if (!documentResult) {
      return;
    }

    const currentDraft = getTabDraft(tab);
    noteWorkspace.updateDraft(tab.tabId, {
      title: nextTitle,
      content: currentDraft?.content ?? documentResult.content,
      baseTitle: currentDraft?.baseTitle ?? documentResult.title,
      baseContent: currentDraft?.baseContent ?? documentResult.content,
    });
  }, [getTabDocument, getTabDraft, noteWorkspace]);

  const handleDocumentContentChange = useCallback((tab: OpenNoteTab, nextContent: string) => {
    const documentResult = getTabDocument(tab);
    if (!documentResult) {
      return;
    }

    const currentDraft = getTabDraft(tab);
    noteWorkspace.updateDraft(tab.tabId, {
      title: currentDraft?.title ?? documentResult.title,
      content: nextContent,
      baseTitle: currentDraft?.baseTitle ?? documentResult.title,
      baseContent: currentDraft?.baseContent ?? documentResult.content,
    });
  }, [getTabDocument, getTabDraft, noteWorkspace]);

  const getUnsafeTabs = useCallback((tabs: OpenNoteTab[]) => (
    tabs.filter((tab) => isTabDirty(tab) || getTabSyncState(tab) === 'save_failed')
  ), [getTabSyncState, isTabDirty]);

  const confirmCloseUnsafeTabs = useCallback(async (tabs: OpenNoteTab[], title: string, confirmLabel: string) => {
    const unsafeTabs = getUnsafeTabs(tabs);
    if (unsafeTabs.length === 0 || !api?.app.confirm) {
      return true;
    }

    const firstTitle = getTabTitle(unsafeTabs[0]) || 'Untitled';
    const failedCount = unsafeTabs.filter((tab) => getTabSyncState(tab) === 'save_failed').length;
    const dirtyCount = unsafeTabs.length - failedCount;
    const detailParts = [
      dirtyCount > 0 ? `${dirtyCount} note${dirtyCount === 1 ? ' has' : 's have'} unsaved changes` : null,
      failedCount > 0 ? `${failedCount} note${failedCount === 1 ? ' has' : 's have'} a failed save` : null,
    ].filter(Boolean);

    try {
      const { confirmed } = await api.app.confirm({
        title,
        message: unsafeTabs.length === 1 ? `Close “${firstTitle}”?` : `Close ${unsafeTabs.length} unsaved notes?`,
        detail: `${detailParts.join(' and ')}. Closing will discard local drafts that have not been saved to HackMD.`,
        confirmLabel,
        cancelLabel: 'Keep Editing',
        destructive: true,
      });
      return confirmed;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm close.');
      return false;
    }
  }, [api, getTabSyncState, getTabTitle, getUnsafeTabs]);

  const requestCloseTab = useCallback(async (tabId: string) => {
    const tab = noteWorkspace.state.tabs[tabId];
    if (!tab) {
      return false;
    }

    if (!await confirmCloseUnsafeTabs([tab], 'Close Tab', 'Close Tab')) {
      return false;
    }

    if (Object.keys(noteWorkspace.state.tabs).length <= 1) {
      const nextNote = visibleEntries[0]?.note ?? null;
      manualEmptyWorkspaceRef.current = true;
      autoSelectSuppressionRef.current = nextNote ? getAutoSelectSuppressionKey(nextNote) : null;
    }

    noteWorkspace.closeTab(tabId);
    return true;
  }, [confirmCloseUnsafeTabs, getAutoSelectSuppressionKey, noteWorkspace, visibleEntries]);

  const requestCloseOtherTabs = useCallback(async (paneId: string, keepTabId: string) => {
    const pane = noteWorkspace.state.panes.find((candidate) => candidate.paneId === paneId);
    if (!pane) {
      return;
    }

    const closingTabs = pane.tabIds
      .filter((tabId) => tabId !== keepTabId)
      .map((tabId) => noteWorkspace.state.tabs[tabId])
      .filter((tab): tab is OpenNoteTab => Boolean(tab));
    if (!await confirmCloseUnsafeTabs(closingTabs, 'Close Other Tabs', 'Close Other Tabs')) {
      return;
    }

    noteWorkspace.closeOtherTabs(paneId, keepTabId);
  }, [confirmCloseUnsafeTabs, noteWorkspace]);

  const requestCloseTabsToRight = useCallback(async (paneId: string, tabId: string) => {
    const pane = noteWorkspace.state.panes.find((candidate) => candidate.paneId === paneId);
    const tabIndex = pane?.tabIds.indexOf(tabId) ?? -1;
    if (!pane || tabIndex < 0) {
      return;
    }

    const closingTabs = pane.tabIds
      .slice(tabIndex + 1)
      .map((candidate) => noteWorkspace.state.tabs[candidate])
      .filter((tab): tab is OpenNoteTab => Boolean(tab));
    if (!await confirmCloseUnsafeTabs(closingTabs, 'Close Tabs to Right', 'Close Tabs')) {
      return;
    }

    noteWorkspace.closeTabsToRight(paneId, tabId);
  }, [confirmCloseUnsafeTabs, noteWorkspace]);

  const runAction = useCallback((actionId: ElectronActionId) => {
    const action = getElectronAction(actionId);
    const disabledReason = getActionDisabledReason(action, actionContext);
    if (disabledReason) {
      toast.info(disabledReason);
      return;
    }

    switch (actionId) {
    case 'open-command-palette':
      openPalette();
      break;
    case 'open-settings':
      setSettingsOpen(true);
      break;
    case 'toggle-theme':
      setTheme(resolvedMode === 'dark' ? 'light' : 'dark');
      break;
    case 'new-note':
      handleCreateNote();
      break;
    case 'new-folder':
      handleCreateFolder();
      break;
    case 'import-markdown-note':
      handleImportMarkdownNote();
      break;
    case 'rename-folder':
      if (selectedFolder?.id && selectedFolder.id !== UNFILED_FOLDER_ID) {
        handleRenameFolder(selectedFolder.id);
      } else {
        toast.info('Select a folder before renaming it.');
      }
      break;
    case 'delete-folder':
      if (selectedFolder?.id && selectedFolder.id !== UNFILED_FOLDER_ID) {
        handleDeleteFolderRequest(selectedFolder.id);
      } else {
        toast.info('Select a folder before deleting it.');
      }
      break;
    case 'refresh':
      refreshWorkspace();
      break;
    case 'go-history':
      pendingRecentNoteRef.current = null;
      setWorkspaceScope({ type: 'history', label: 'History' });
      focusZone('navigator');
      break;
    case 'toggle-workspace-rail':
      toggleRailCollapsed();
      break;
    case 'toggle-navigator':
      toggleNavigatorCollapsed();
      break;
    case 'toggle-inspector':
      toggleInspectorCollapsed();
      break;
    case 'toggle-reader-mode':
      setReaderMode(readerMode === 'read' ? 'edit' : 'read');
      break;
    case 'save-note':
      if (selectedDocument && noteDirty && !mutations.updateNoteMutation.isPending) {
        mutations.updateNoteMutation.mutate({
          note: selectedDocument,
          input: { title: documentTitle, content: documentContent },
        });
      }
      break;
    case 'export-note-markdown':
      if (selectedDocument) {
        handleExportMarkdown(selectedDocument, documentTitle, documentContent);
      }
      break;
    case 'open-note-web-editor':
      if (api && selectedDocument) {
        trackRecentNote(selectedDocument);
        void Promise.resolve(api.shell.openHackmdEditor(selectedDocument)).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to open HackMD editor.');
        });
      }
      break;
    case 'delete-note':
      if (selectedDocument) {
        handleDeleteRequest(selectedDocument);
      }
      break;
    case 'close-tab':
      if (activeTab) {
        void requestCloseTab(activeTab.tabId);
      }
      break;
    case 'close-other-tabs':
      if (activeTab) {
        void requestCloseOtherTabs(noteWorkspace.state.activePaneId, activeTab.tabId);
      }
      break;
    case 'close-tabs-to-right':
      if (activeTab) {
        void requestCloseTabsToRight(noteWorkspace.state.activePaneId, activeTab.tabId);
      }
      break;
    case 'reopen-last-closed-tab':
      noteWorkspace.reopenLastClosed();
      focusZone('editor');
      break;
    case 'split-pane-right':
      noteWorkspace.splitActiveTab();
      focusZone('editor');
      break;
    case 'move-tab-to-other-pane':
      noteWorkspace.moveActiveTabToOtherPane();
      focusZone('editor');
      break;
    case 'focus-next-tab':
      noteWorkspace.focusNextTab();
      focusZone('editor');
      break;
    case 'focus-previous-tab':
      noteWorkspace.focusPreviousTab();
      focusZone('editor');
      break;
    case 'focus-next-pane':
      noteWorkspace.focusNextPane();
      focusZone('editor');
      break;
    case 'focus-previous-pane':
      noteWorkspace.focusPreviousPane();
      focusZone('editor');
      break;
    case 'export-debug-logs':
      void api?.app.exportDebugLogs()
        .then((path) => toast.success(`Debug logs exported to ${path}`))
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to export debug logs.');
        });
      break;
    case 'focus-workspace':
      focusZone('workspace');
      break;
    case 'focus-navigator':
      focusZone('navigator');
      break;
    case 'focus-editor':
      focusZone('editor');
      break;
    case 'focus-inspector':
      focusZone('inspector');
      break;
    }
  }, [
    actionContext,
    activeTab,
    api,
    documentContent,
    documentTitle,
    focusZone,
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
    refreshWorkspace,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
    resolvedMode,
    readerMode,
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

  const settleCloseRequest = useCallback(async (request: HackDeskCloseRequest = { source: 'window-button' }) => {
    if (!api) {
      return;
    }

    const cancelClose = async () => {
      try {
        await api.app.cancelClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to cancel window close.');
      }
    };

    if (closeTransientLayer()) {
      await cancelClose();
      return;
    }

    if (request.source === 'keyboard-shortcut' && activeTab) {
      const closed = await requestCloseTab(activeTab.tabId);
      await cancelClose();
      if (!closed) {
        return;
      }
      return;
    } else {
      const allTabs = Object.values(noteWorkspace.state.tabs);
      if (!await confirmCloseUnsafeTabs(allTabs, 'Close HackDesk', 'Close')) {
        await cancelClose();
        return;
      }
    }

    try {
      await api.app.confirmClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to close window.');
    }
  }, [activeTab, api, closeTransientLayer, confirmCloseUnsafeTabs, noteWorkspace.state.tabs, requestCloseTab]);

  useEffect(() => {
    return api?.app.onCommand((command) => {
      runAction(command.type);
    });
  }, [api, runAction]);

  useEffect(() => {
    return api?.app.onCloseRequest((request) => {
      void settleCloseRequest(request);
    });
  }, [api, settleCloseRequest]);

  const handleGlobalKeyDown = useCallback((event: KeyboardEvent) => {
    const isPrimaryModifier = event.metaKey || event.ctrlKey;
    if (isPrimaryModifier && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openPalette();
      return;
    }

    if (isPrimaryModifier && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      handleCreateNote();
      return;
    }

    if (isPrimaryModifier && event.shiftKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      refreshWorkspace();
      return;
    }

    if (isPrimaryModifier && event.key.toLowerCase() === 's') {
      if (noteDirty) {
        event.preventDefault();
        runAction('save-note');
      }
      return;
    }

    if (isPrimaryModifier && event.key.toLowerCase() === 'w') {
      event.preventDefault();
      runAction('close-tab');
      return;
    }

    if (isPrimaryModifier && event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      runAction('reopen-last-closed-tab');
      return;
    }

    if (isPrimaryModifier && event.shiftKey && event.key === '\\') {
      event.preventDefault();
      runAction('split-pane-right');
      return;
    }

    if (event.ctrlKey && event.key === 'Tab') {
      event.preventDefault();
      runAction(event.shiftKey ? 'focus-previous-tab' : 'focus-next-tab');
      return;
    }

    if (event.altKey && event.key === ']') {
      event.preventDefault();
      runAction('focus-next-pane');
      return;
    }

    if (event.altKey && event.key === '[') {
      event.preventDefault();
      runAction('focus-previous-pane');
      return;
    }

    if (event.altKey && event.key === '1') {
      event.preventDefault();
      runAction('focus-workspace');
      return;
    }

    if (event.altKey && event.key === '2') {
      event.preventDefault();
      runAction('focus-navigator');
      return;
    }

    if (event.altKey && event.key === '3') {
      event.preventDefault();
      runAction('focus-editor');
      return;
    }

    if (event.altKey && event.key === '4') {
      event.preventDefault();
      runAction('focus-inspector');
      return;
    }

    if (event.altKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      runAction('toggle-navigator');
      return;
    }

    if (event.altKey && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      runAction('toggle-inspector');
      return;
    }

    if (event.key !== 'Escape') {
      return;
    }

    if (closeTransientLayer()) {
      return;
    }

    const targetZone = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus
      : null;
    if (targetZone === 'editor' || targetZone === 'inspector') {
      return;
    }

    if (activeFinderState.query) {
      setFinderState((current) => clearNoteFinderQuery(current));
      return;
    }

    if (hasActiveNoteFinderFilters(activeFinderState)) {
      setFinderState((current) => clearNoteFinderFilters(current));
      return;
    }

    if (selectedFolderId) {
      setSelectedFolderId(null);
    }
  }, [
    closeTransientLayer,
    handleCreateNote,
    noteDirty,
    openPalette,
    refreshWorkspace,
    runAction,
    activeFinderState,
    selectedFolderId,
  ]);

  const globalKeyDownHandlerRef = useRef(handleGlobalKeyDown);

  useEffect(() => {
    globalKeyDownHandlerRef.current = handleGlobalKeyDown;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => globalKeyDownHandlerRef.current(event);

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const getPaneTabs = (pane: NotePane) => (
    pane.tabIds
      .map((tabId) => noteWorkspace.state.tabs[tabId])
      .filter((tab): tab is OpenNoteTab => Boolean(tab))
      .map((tab) => ({ ...tab, title: getTabTitle(tab) }))
  );

  const getPaneView = (pane: NotePane): DocumentPaneView => {
    const tab = getPaneActiveTab(noteWorkspace.state, pane.paneId);
    const documentResult = tab ? getTabDocumentResult(tab) : undefined;
    const documentValue = tab ? getTabDocument(tab) : undefined;
    const syncState = tab ? getTabSyncState(tab) : 'idle';
    const identity = tab ? getTabIdentity(tab) : null;
    const isSavingTab = Boolean(identity && mutations.updateNoteMutation.isPending
      && noteIdentityMatches(mutations.updateNoteMutation.variables?.note, identity));
    const isUploadingTab = Boolean(identity && mutations.uploadNoteImageMutation.isPending
      && noteIdentityMatches(mutations.uploadNoteImageMutation.variables?.note, identity));
    const isDeletingTab = Boolean(identity && mutations.deleteNoteMutation.isPending
      && noteIdentityMatches(mutations.deleteNoteMutation.variables, identity));

    return {
      pane,
      activeTab: tab,
      selectedNote: tab ? { title: getTabTitle(tab) } : null,
      document: documentValue,
      title: tab ? getTabTitle(tab) : '',
      content: tab ? getTabContent(tab) : '',
      isLoading: syncState === 'loading' && !isShowingCachedFallback(documentResult),
      syncState,
      isSaving: isSavingTab,
      isSavingMetadata: isSavingTab,
      isUploadingImage: isUploadingTab,
      isDeleting: isDeletingTab,
    };
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
          canReopenLastClosedTab={noteWorkspace.state.recentlyClosedTabs.length > 0}
          onResizePanes={noteWorkspace.resizePanes}
          onFocusPane={noteWorkspace.focusPane}
          onSelectTab={noteWorkspace.selectTab}
          onCloseTab={(tabId) => {
            void requestCloseTab(tabId);
          }}
          onCloseOtherTabs={(paneId, tabId) => {
            void requestCloseOtherTabs(paneId, tabId);
          }}
          onCloseTabsToRight={(paneId, tabId) => {
            void requestCloseTabsToRight(paneId, tabId);
          }}
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
