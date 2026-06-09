import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { getDesktopAPI } from '@/lib/desktop-api';
import type { DocumentSummary, ElectronActionId, FolderSummary, NoteSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import { AppTopBar } from './electron-home/AppTopBar';
import { CommandPaletteDialog } from './electron-home/CommandPaletteDialog';
import { CreateFolderDialog } from './electron-home/CreateFolderDialog';
import { CreateNoteDialog } from './electron-home/CreateNoteDialog';
import { DeleteNoteDialog } from './electron-home/DeleteNoteDialog';
import { DocumentDetail } from './electron-home/DocumentDetail';
import { FolderNavigator } from './electron-home/FolderNavigator';
import { PanelResizeSash } from './electron-home/PanelResizeSash';
import { SettingsDialog } from './electron-home/SettingsDialog';
import { WorkspaceRail } from './electron-home/WorkspaceRail';
import {
  getRepositoryError,
  getScopeStorageKey,
  isShowingCachedFallback,
} from './electron-home/repository';
import type { CommandPaletteState, CreateFolderDialogState, CreateNoteDialogState, WorkspaceScope } from './electron-home/types';
import {
  FOLDER_COLLAPSED_PREFIX,
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
  writeBooleanStorage,
  writeNumberStorage,
  writeStringArrayStorage,
} from './electron-home/ui-preferences';
import {
  getFolderNoteEntries,
  getFolderPathLabel,
  noteMatchesSearch,
} from './electron-home/ui';
import { useElectronHackmdQueries } from './electron-home/useElectronHackmdQueries';
import { useElectronNoteMutations } from './electron-home/useElectronNoteMutations';

function focusRegion(region: 'workspace' | 'navigator' | 'editor') {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-hackdesk-focus="${region}"]`)?.focus();
  });
}

export function Home() {
  const api = getDesktopAPI();
  const [scope, setScope] = useState<WorkspaceScope>({ type: 'personal', label: 'My Workspace' });
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteSummary | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [palette, setPalette] = useState<CommandPaletteState>({ open: false, search: '' });
  const [createDialog, setCreateDialog] = useState<CreateNoteDialogState>({ open: false, title: '' });
  const [createFolderDialog, setCreateFolderDialog] = useState<CreateFolderDialogState>({ open: false, name: '' });
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(() => readBooleanStorage(RAIL_COLLAPSED_KEY, false));
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(() => readBooleanStorage(NAVIGATOR_COLLAPSED_KEY, false));
  const [railWidth, setRailWidth] = useState(() => (
    readNumberStorage(RAIL_WIDTH_KEY, RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX)
  ));
  const [navigatorWidth, setNavigatorWidth] = useState(() => (
    readNumberStorage(NAVIGATOR_WIDTH_KEY, NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MIN, NAVIGATOR_WIDTH_MAX)
  ));
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => (
    readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}personal`)
  ));

  const {
    settings,
    hasToken,
    user,
    teams,
    currentNotes,
    currentFolders,
    document,
    queries,
  } = useElectronHackmdQueries({ api, scope, selectedNote });

  const folderTree = useMemo(
    () => buildHackmdFolderTree(currentNotes, currentFolders),
    [currentFolders, currentNotes],
  );
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const visibleEntries = useMemo(() => {
    const entries = normalizedSearch
      ? folderTree.allNotes.filter((entry) => noteMatchesSearch(entry, normalizedSearch))
      : getFolderNoteEntries(folderTree, selectedFolderId);

    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = normalizedSearch ? `${entry.folderLabel}:${entry.note.id}` : entry.note.id;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [folderTree, normalizedSearch, selectedFolderId]);
  const selectedFolder = selectedFolderId === UNFILED_FOLDER_ID
    ? folderTree.unfiled
    : selectedFolderId ? folderTree.nodesById.get(selectedFolderId) ?? null : null;
  const selectedFolderLabel = selectedFolder ? getFolderPathLabel(selectedFolder.folderPath) : null;
  const selectedParentFolderId = selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID ? selectedFolderId : undefined;
  const canCreate = hasToken && scope.type !== 'history';

  const mutations = useElectronNoteMutations({
    api,
    scope,
    selectedNote,
    selectedParentFolderId,
    onSettingsSaved: () => setSettingsOpen(false),
    onNoteCreated: (note) => {
      setCreateDialog({ open: false, title: '' });
      setSelectedNote(note);
    },
    onFolderCreated: (folder: FolderSummary) => {
      setCreateFolderDialog({ open: false, name: '' });
      if (folder.id) {
        setSelectedFolderId(folder.id);
      }
    },
    onNoteDeleted: () => {
      setDeleteTarget(null);
      setSelectedNote(null);
    },
  });

  const refreshWorkspace = useCallback(() => {
    void queries.userQuery.refetch();
    void queries.teamsQuery.refetch();
    void queries.notesQuery.refetch();
    if (scope.type !== 'history') {
      void queries.foldersQuery.refetch();
    }
  }, [queries.foldersQuery, queries.notesQuery, queries.teamsQuery, queries.userQuery, scope.type]);

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

    setCreateFolderDialog({ open: true, name: '' });
  }, [hasToken, scope.type]);

  const openPalette = useCallback(() => {
    setPalette({ open: true, search: '' });
  }, []);

  const runAction = useCallback((actionId: ElectronActionId) => {
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
    case 'refresh':
      refreshWorkspace();
      break;
    case 'focus-workspace':
      focusRegion('workspace');
      break;
    case 'focus-navigator':
      focusRegion('navigator');
      break;
    case 'focus-editor':
      focusRegion('editor');
      break;
    }
  }, [handleCreateNote, openPalette, refreshWorkspace]);

  const handleDeleteRequest = useCallback((note: DocumentSummary) => {
    if (!api?.app.confirm) {
      setDeleteTarget(note);
      return;
    }

    api.app.confirm({
      title: 'Delete Note',
      message: `Delete “${note.title || 'Untitled'}”?`,
      detail: 'This removes the note from HackMD. This action cannot be undone from HackDesk.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    }).then(({ confirmed }) => {
      if (confirmed) {
        mutations.deleteNoteMutation.mutate(note);
      }
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm note deletion.');
    });
  }, [api, mutations.deleteNoteMutation]);

  const handleOpenEditor = useCallback((note: DocumentSummary) => {
    api?.shell.openHackmdEditor(note).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to open HackMD editor.');
    });
  }, [api]);

  useEffect(() => {
    const storageKey = `${FOLDER_COLLAPSED_PREFIX}${getScopeStorageKey(scope)}`;
    setCollapsedFolderIds(readStringArrayStorage(storageKey));
    setSelectedFolderId(null);
    setSelectedNote(null);
    setSearch('');
  }, [scope]);

  useEffect(() => {
    writeStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${getScopeStorageKey(scope)}`, collapsedFolderIds);
  }, [collapsedFolderIds, scope]);

  useEffect(() => {
    if (!selectedNote || !visibleEntries.some((entry) => entry.note.id === selectedNote.id)) {
      setSelectedNote(visibleEntries[0]?.note ?? null);
    }
  }, [selectedNote, visibleEntries]);

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

      if (event.altKey && event.key === '1') {
        event.preventDefault();
        focusRegion('workspace');
        return;
      }

      if (event.altKey && event.key === '2') {
        event.preventDefault();
        focusRegion('navigator');
        return;
      }

      if (event.altKey && event.key === '3') {
        event.preventDefault();
        focusRegion('editor');
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
        setCreateFolderDialog({ open: false, name: '' });
        return;
      }

      if (deleteTarget) {
        setDeleteTarget(null);
        return;
      }

      if (settingsOpen) {
        setSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    createDialog.open,
    createFolderDialog.open,
    deleteTarget,
    handleCreateNote,
    openPalette,
    palette.open,
    refreshWorkspace,
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
  const userError = getRepositoryError(queries.userQuery.data);
  const teamsError = getRepositoryError(queries.teamsQuery.data);
  const activeError = notesError ?? foldersError ?? userError ?? teamsError;
  const showingCachedFallback =
    isShowingCachedFallback(queries.notesQuery.data)
    || isShowingCachedFallback(queries.foldersQuery.data)
    || isShowingCachedFallback(queries.userQuery.data)
    || isShowingCachedFallback(queries.teamsQuery.data);
  const emptyTitle = !hasToken
    ? 'Connect HackMD first'
    : normalizedSearch
      ? 'No matching notes'
      : selectedFolder
        ? 'No notes in this folder'
        : 'No notes in this workspace';
  const emptyDescription = !hasToken
    ? 'Add an API token in Settings to load your profile, teams, notes, and history.'
    : normalizedSearch
      ? 'Try a different title, tag, folder path, short ID, or team path.'
      : scope.type === 'history'
        ? 'Your HackMD history will appear here after the first successful sync.'
        : 'Select another folder, create a note here, or refresh after another client changes HackMD.';

  const toggleRailCollapsed = () => {
    setRailCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(RAIL_COLLAPSED_KEY, next);
      return next;
    });
  };
  const toggleNavigatorCollapsed = () => {
    setNavigatorCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(NAVIGATOR_COLLAPSED_KEY, next);
      return next;
    });
  };
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

  return (
    <div className="app-chrome flex h-screen flex-col overflow-hidden bg-background-muted text-text-default">
      <AppTopBar
        railCollapsed={railCollapsed}
        onToggleRail={toggleRailCollapsed}
      />

      <main className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceRail
          scope={scope}
          user={user}
          teams={teams}
          collapsed={railCollapsed}
          width={railWidth}
          onScopeChange={setScope}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <PanelResizeSash
          label="Resize workspace sidebar"
          value={railWidth}
          min={RAIL_WIDTH_MIN}
          max={RAIL_WIDTH_MAX}
          disabled={railCollapsed}
          onChange={(value) => {
            setRailWidth(value);
            writeNumberStorage(RAIL_WIDTH_KEY, value);
          }}
        />

        <FolderNavigator
          scope={scope}
          tree={folderTree}
          entries={visibleEntries}
          selectedFolderId={selectedFolderId}
          selectedNoteId={selectedNote?.id ?? null}
          search={search}
          isLoading={queries.notesQuery.isLoading || queries.foldersQuery.isLoading}
          hasToken={hasToken}
          collapsed={navigatorCollapsed}
          width={navigatorWidth}
          collapsedFolderIds={collapsedFolderIds}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          activeError={activeError}
          showingCachedFallback={showingCachedFallback}
          canCreate={canCreate}
          isFetching={queries.notesQuery.isFetching || queries.foldersQuery.isFetching}
          isCreating={mutations.createNoteMutation.isPending || mutations.createFolderMutation.isPending}
          onFolderSelect={handleFolderSelect}
          onFolderToggle={toggleFolderCollapsed}
          onNoteSelect={setSelectedNote}
          onSearchChange={setSearch}
          onRefresh={refreshWorkspace}
          onCreate={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onToggleCollapsed={toggleNavigatorCollapsed}
          onOpenPalette={openPalette}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <PanelResizeSash
          label="Resize note navigator"
          value={navigatorWidth}
          min={NAVIGATOR_WIDTH_MIN}
          max={NAVIGATOR_WIDTH_MAX}
          disabled={navigatorCollapsed}
          onChange={(value) => {
            setNavigatorWidth(value);
            writeNumberStorage(NAVIGATOR_WIDTH_KEY, value);
          }}
        />

        <DocumentDetail
          document={document}
          isLoading={queries.documentQuery.isLoading || queries.documentQuery.isFetching}
          onOpenEditor={handleOpenEditor}
          onSave={(note, input) => mutations.updateNoteMutation.mutate({ note, input })}
          onDelete={handleDeleteRequest}
          isSaving={mutations.updateNoteMutation.isPending}
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
        onStateChange={setPalette}
        onRunAction={runAction}
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
        onCreate={(name) => mutations.createFolderMutation.mutate(name)}
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
