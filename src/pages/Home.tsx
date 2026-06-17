import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { getDesktopAPI } from '@/lib/desktop-api';
import type {
  DocumentSummary,
  ElectronActionId,
  FolderSummary,
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
import { DocumentDetail, type DocumentDetailCommand } from './electron-home/DocumentDetail';
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
import type {
  CommandPaletteState,
  CreateFolderDialogState,
  CreateNoteDialogState,
  RenameFolderDialogState,
  WorkspaceScope,
} from './electron-home/types';
import {
  FOLDER_COLLAPSED_PREFIX,
  LAST_WORKSPACE_SCOPE_KEY,
  NAVIGATOR_COLLAPSED_KEY,
  NAVIGATOR_WIDTH_DEFAULT,
  NAVIGATOR_WIDTH_KEY,
  NAVIGATOR_WIDTH_MAX,
  NAVIGATOR_WIDTH_MIN,
  RAIL_COLLAPSED_KEY,
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_KEY,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
  readBooleanStorage,
  readNumberStorage,
  readStringArrayStorage,
  readWorkspaceScopeStorage,
  writeBooleanStorage,
  writeNumberStorage,
  writeStringArrayStorage,
  writeWorkspaceScopeStorage,
} from './electron-home/ui-preferences';
import {
  getFolderNoteEntries,
  getFolderPathLabel,
} from './electron-home/ui';
import { useElectronHackmdQueries } from './electron-home/useElectronHackmdQueries';
import { useElectronFocusZones } from './electron-home/useElectronFocusZones';
import { useElectronNoteMutations } from './electron-home/useElectronNoteMutations';

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

export function Home() {
  const api = getDesktopAPI();
  const initialWorkspaceScope = readWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, DEFAULT_WORKSPACE_SCOPE);
  const [scope, setScopeState] = useState<WorkspaceScope>(() => initialWorkspaceScope);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteSummary | null>(null);
  const [recentNotes, setRecentNotes] = useState<ElectronRecentNote[]>(() => readRecentNotes(window.localStorage));
  const [pendingRecentNote, setPendingRecentNote] = useState<ElectronRecentNote | null>(null);
  const [finderState, setFinderState] = useState<NoteFinderState>(() => (
    readNoteFinderState(window.localStorage, getScopeStorageKey(initialWorkspaceScope))
  ));
  const deferredFinderQuery = useDeferredValue(finderState.query);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [palette, setPalette] = useState<CommandPaletteState>({ open: false, search: '' });
  const [createDialog, setCreateDialog] = useState<CreateNoteDialogState>({ open: false, title: '' });
  const [createFolderDialog, setCreateFolderDialog] = useState<CreateFolderDialogState>(createClosedFolderDialogState);
  const [renameFolderDialog, setRenameFolderDialog] = useState<RenameFolderDialogState>(createClosedRenameFolderDialogState);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderTreeNode | null>(null);
  const [noteDirty, setNoteDirty] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [documentCommand, setDocumentCommand] = useState<DocumentDetailCommand | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(() => readBooleanStorage(RAIL_COLLAPSED_KEY, false));
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(() => readBooleanStorage(NAVIGATOR_COLLAPSED_KEY, false));
  const [railWidth, setRailWidth] = useState(() => (
    readNumberStorage(RAIL_WIDTH_KEY, RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX)
  ));
  const [navigatorWidth, setNavigatorWidth] = useState(() => (
    readNumberStorage(NAVIGATOR_WIDTH_KEY, NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MIN, NAVIGATOR_WIDTH_MAX)
  ));
  const skipNextFinderWriteRef = useRef(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => (
    readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}personal`)
  ));
  const { focusZone } = useElectronFocusZones();
  const scopeStorageKey = useMemo(() => getScopeStorageKey(scope), [scope]);

  const setWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    setScopeState(nextScope);
    writeWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, nextScope);
  }, []);

  const {
    settings,
    hasToken,
    user,
    teams,
    currentNotes,
    currentFolders,
    currentFolderOrder,
    document,
    queries,
  } = useElectronHackmdQueries({ api, scope, selectedNote });

  const folderTree = useMemo(
    () => buildHackmdFolderTree(currentNotes, currentFolders, currentFolderOrder),
    [currentFolderOrder, currentFolders, currentNotes],
  );
  const deferredFinderState = useMemo<NoteFinderState>(() => ({
    ...finderState,
    query: deferredFinderQuery,
  }), [deferredFinderQuery, finderState]);
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

  const dispatchDocumentCommand = useCallback((id: DocumentDetailCommand['id']) => {
    setDocumentCommand((current) => ({
      id,
      sequence: (current?.sequence ?? 0) + 1,
    }));
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

  const selectNoteAndTrackRecent = useCallback((note: NoteSummary) => {
    setSelectedNote(note);
    trackRecentNote(note);
  }, [trackRecentNote]);

  const mutations = useElectronNoteMutations({
    api,
    scope,
    selectedNote,
    selectedParentFolderId,
    onSettingsSaved: () => setSettingsOpen(false),
    onNoteCreated: (note) => {
      setCreateDialog({ open: false, title: '' });
      selectNoteAndTrackRecent(note);
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
      setSelectedNote(null);
      setSelectedFolderId(parentFolderId ?? UNFILED_FOLDER_ID);
    },
    onNoteDeleted: (note) => {
      removeRecentNoteEntry(note.id, note.teamPath ?? null);
      setDeleteTarget(null);
      setSelectedNote(null);
    },
    onNoteMoved: (note, targetFolderId) => {
      setSelectedFolderId(targetFolderId ?? UNFILED_FOLDER_ID);
      selectNoteAndTrackRecent(note);
    },
  });

  const actionContext = useMemo<ElectronActionContext>(() => ({
    hasToken,
    canCreate,
    scopeType: scope.type,
    selectedFolderId,
    canModifySelectedFolder,
    selectedNoteId: selectedNote?.id ?? null,
    noteDirty,
    isSavingNote: mutations.updateNoteMutation.isPending,
    inspectorCollapsed,
    navigatorCollapsed,
    workspaceRailCollapsed: railCollapsed,
  }), [
    canCreate,
    canModifySelectedFolder,
    hasToken,
    inspectorCollapsed,
    mutations.updateNoteMutation.isPending,
    navigatorCollapsed,
    noteDirty,
    railCollapsed,
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
    case 'new-note':
      handleCreateNote();
      break;
    case 'new-folder':
      handleCreateFolder();
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
      setPendingRecentNote(null);
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
      dispatchDocumentCommand('toggle-inspector');
      break;
    case 'save-note':
      dispatchDocumentCommand('save-note');
      break;
    case 'open-note-web-editor':
      dispatchDocumentCommand('open-note-web-editor');
      break;
    case 'delete-note':
      dispatchDocumentCommand('delete-note');
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
    api,
    dispatchDocumentCommand,
    focusZone,
    handleCreateFolder,
    handleCreateNote,
    handleDeleteFolderRequest,
    handleRenameFolder,
    openPalette,
    refreshWorkspace,
    selectedFolder,
    setWorkspaceScope,
    toggleNavigatorCollapsed,
    toggleRailCollapsed,
  ]);

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

  const revealNoteEntry = useCallback((entry: FolderTreeNote) => {
    const folderIds = entry.folderPath.map((folder) => folder.id);
    const leafFolderId = folderIds.at(-1) ?? UNFILED_FOLDER_ID;
    expandNavigator();
    revealFolderIds(folderIds);
    setSelectedFolderId(leafFolderId);
    selectNoteAndTrackRecent(entry.note);
    focusZone('editor');
  }, [expandNavigator, focusZone, revealFolderIds, selectNoteAndTrackRecent]);

  useEffect(() => {
    if (scope.type !== 'team') {
      return;
    }

    const team = teams.find((candidate) => candidate.path === scope.teamPath);
    if (!team || team.name === scope.label) {
      return;
    }

    setWorkspaceScope({ type: 'team', label: team.name, teamPath: team.path });
  }, [scope, setWorkspaceScope, teams]);

  useEffect(() => {
    const storageKey = `${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`;
    setCollapsedFolderIds(readStringArrayStorage(storageKey));
    setSelectedFolderId(null);
    setSelectedNote(null);
    skipNextFinderWriteRef.current = true;
    setFinderState(readNoteFinderState(window.localStorage, scopeStorageKey));
  }, [scopeStorageKey]);

  useEffect(() => {
    writeStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`, collapsedFolderIds);
  }, [collapsedFolderIds, scopeStorageKey]);

  useEffect(() => {
    if (skipNextFinderWriteRef.current) {
      skipNextFinderWriteRef.current = false;
      return;
    }

    writeNoteFinderState(window.localStorage, scopeStorageKey, finderState);
  }, [finderState, scopeStorageKey]);

  useEffect(() => {
    if (!selectedFolderId && finderState.searchScope === 'current-folder') {
      setFinderState((current) => ({ ...current, searchScope: 'workspace' }));
    }
  }, [finderState.searchScope, selectedFolderId]);

  useEffect(() => {
    if (!selectedNote || !visibleEntries.some((entry) => entry.note.id === selectedNote.id)) {
      setSelectedNote(visibleEntries[0]?.note ?? null);
    }
  }, [selectedNote, visibleEntries]);

  useEffect(() => {
    if (!pendingRecentNote) {
      return;
    }

    const currentTeamPath = scope.type === 'team' ? scope.teamPath : null;
    const isTargetScopeLoaded = scope.type !== 'history' && currentTeamPath === pendingRecentNote.teamPath;
    if (!isTargetScopeLoaded || queries.notesQuery.isLoading || queries.notesQuery.isFetching) {
      return;
    }

    const loadedEntry = folderTree.allNotes.find((candidate) => recentNoteMatches(candidate.note, pendingRecentNote));
    setPendingRecentNote(null);
    if (loadedEntry) {
      revealNoteEntry(loadedEntry);
      return;
    }

    removeRecentNoteEntry(pendingRecentNote.noteId, pendingRecentNote.teamPath);
    toast.info(`“${pendingRecentNote.title || 'Untitled'}” is no longer available in this workspace.`);
  }, [
    folderTree.allNotes,
    pendingRecentNote,
    queries.notesQuery.isFetching,
    queries.notesQuery.isLoading,
    removeRecentNoteEntry,
    revealNoteEntry,
    scope,
  ]);

  useEffect(() => {
    return api?.app.onCommand((command) => {
      runAction(command.type);
    });
  }, [api, runAction]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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

      if (palette.open) {
        setPalette({ open: false, search: '' });
        return;
      }

      if (createDialog.open) {
        setCreateDialog({ open: false, title: '' });
        return;
      }

      if (createFolderDialog.open) {
        setCreateFolderDialog(createClosedFolderDialogState());
        return;
      }

      if (deleteTarget) {
        setDeleteTarget(null);
        return;
      }

      if (deleteFolderTarget) {
        setDeleteFolderTarget(null);
        return;
      }

      if (renameFolderDialog.open) {
        setRenameFolderDialog(createClosedRenameFolderDialogState());
        return;
      }

      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }

      const targetZone = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus
        : null;
      if (targetZone === 'editor' || targetZone === 'inspector') {
        return;
      }

      if (finderState.query) {
        setFinderState((current) => clearNoteFinderQuery(current));
        return;
      }

      if (hasActiveNoteFinderFilters(finderState)) {
        setFinderState((current) => clearNoteFinderFilters(current));
        return;
      }

      if (selectedFolderId) {
        setSelectedFolderId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    createDialog.open,
    createFolderDialog.open,
    deleteTarget,
    deleteFolderTarget,
    handleCreateNote,
    noteDirty,
    openPalette,
    palette.open,
    renameFolderDialog.open,
    refreshWorkspace,
    runAction,
    finderState,
    selectedFolderId,
    settingsOpen,
  ]);

  if (!api) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-muted text-sm text-text-subtle">
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
    revealNoteEntry(entry);
  };

  const handleQuickOpenRecentNote = (entry: ElectronRecentNote) => {
    const loadedEntry = folderTree.allNotes.find((candidate) => (
      recentNoteMatches(candidate.note, entry)
    ));

    if (loadedEntry) {
      setPendingRecentNote(null);
      revealNoteEntry(loadedEntry);
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
      setPendingRecentNote(entry);
      setWorkspaceScope({
        type: 'team',
        label: team?.name ?? entry.teamPath,
        teamPath: entry.teamPath,
      });
      toast.info(`Loading ${team?.name ?? entry.teamPath} before opening “${entry.title || 'Untitled'}”.`);
      focusZone('navigator');
      return;
    }

    setPendingRecentNote(entry);
    setWorkspaceScope({ type: 'personal', label: 'My Workspace' });
    toast.info(`Loading My Workspace before opening “${entry.title || 'Untitled'}”.`);
    focusZone('navigator');
  };

  const handleQuickOpenWorkspace = (workspace: QuickOpenWorkspaceResult) => {
    setPendingRecentNote(null);
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
    setSelectedNote(null);
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
    <div className="app-chrome flex h-screen flex-col overflow-hidden bg-background-muted text-text-default">
      <AppTopBar
        railCollapsed={railCollapsed}
        railPanelId={WORKSPACE_RAIL_PANEL_ID}
        onToggleRail={toggleRailCollapsed}
      />

      <main className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceRail
          id={WORKSPACE_RAIL_PANEL_ID}
          scope={scope}
          user={user}
          teams={teams}
          collapsed={railCollapsed}
          width={railWidth}
          onScopeChange={(nextScope) => {
            setPendingRecentNote(null);
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
          scope={scope}
          tree={folderTree}
          entries={visibleEntries}
          selectedFolderId={selectedFolderId}
          selectedNoteId={selectedNote?.id ?? null}
          finderState={finderState}
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
          onNoteSelect={selectNoteAndTrackRecent}
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
              setSelectedNote(operation.note.note);
              return;
            }

            mutations.moveNoteMutation.mutate({
              note: operation.note.note,
              targetFolderId: operation.targetFolderId,
            });
          }}
          onOpenNote={handleOpenEditor}
          onDeleteNote={handleDeleteRequest}
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

        <DocumentDetail
          document={document}
          folderTree={folderTree}
          isLoading={queries.documentQuery.isLoading || queries.documentQuery.isFetching}
          command={documentCommand}
          onOpenEditor={handleOpenEditor}
          onSave={(note, input) => mutations.updateNoteMutation.mutate({ note, input })}
          onSaveMetadata={(note, input) => mutations.updateNoteMutation.mutate({ note, input })}
          onUploadImage={(note, input) => mutations.uploadNoteImageMutation.mutateAsync({ note, input })}
          onDelete={handleDeleteRequest}
          onDirtyStateChange={setNoteDirty}
          onInspectorCollapsedChange={setInspectorCollapsed}
          isSaving={mutations.updateNoteMutation.isPending}
          isSavingMetadata={mutations.updateNoteMutation.isPending}
          isUploadingImage={mutations.uploadNoteImageMutation.isPending}
          isDeleting={mutations.deleteNoteMutation.isPending}
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
        scope={scope}
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
        scopeLabel={scope.label}
        folderLabel={selectedFolderLabel}
        isCreating={mutations.createNoteMutation.isPending}
        onStateChange={setCreateDialog}
        onCreate={(title) => mutations.createNoteMutation.mutate(title)}
      />

      <CreateFolderDialog
        state={createFolderDialog}
        scopeLabel={scope.label}
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
