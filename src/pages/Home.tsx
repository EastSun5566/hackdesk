import { KeyboardNavigation } from './electron-home/KeyboardNavigation';
import { LocalVaultNameContext, NoteSummaryLookupContext, TeamNameLookupContext } from '@/pages/electron-home/NoteSummaryCard';
import { ConfirmDialogHost } from '@/components/ConfirmDialogHost';
import { DialogReturnFocusProvider } from '@/components/ui/dialog';
import { getElectronAction, getResolvedActionShortcut } from '@/lib/electron-actions';
import { ActionShortcutContext } from './electron-home/ActionShortcutContext';
import { KeyboardShortcutsDialog } from './electron-home/KeyboardShortcutsDialog';
import { KeyHintBar } from './electron-home/KeyHintBar';
import { LeaderMenu } from './electron-home/LeaderMenu';
import { DraftDestinationDialog } from './electron-home/DraftDestinationDialog';
import { INITIAL_DRAFT_SCOPE_KEY } from './electron-home/initial-draft-workspace';
import { getLeaderLevel } from '@/lib/leader-keys';
import { BookSessionContext, useBookSession } from './electron-home/useBookSession';
import { TemplatePickerDialog } from './electron-home/TemplatePickerDialog';
import { useNoteTemplates } from './electron-home/useNoteTemplates';
import { useAskNotes } from './electron-home/useAskNotes';
import { AskNotesDialog } from './electron-home/AskNotesDialog';
import { toRecentNote, type InPlaceTarget } from './electron-home/useNoteLinkOpener';
import { toast } from '@/components/ui/toast';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/components/theme-provider';
import { getDesktopAPI } from '@/lib/desktop-api';
import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import type { ElectronSafeSettings, FolderSummary, NoteSummary } from '@/lib/electron-api';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { getNoteCurrentFolderId } from '@/lib/hackmd-note-dnd';
import type { QuickOpenFolderResult } from '@/lib/electron-quick-open';
import { defaultSettings, getActiveLocalVaultPath, getActiveLocalWorkspace } from '@/lib/settings';

import { ElectronHomeOverlays } from './electron-home/ElectronHomeOverlays';
import { ElectronHomeWorkspace, NOTE_NAVIGATOR_PANEL_ID } from './electron-home/ElectronHomeWorkspace';
import { useSplitStatusLine } from './electron-home/split-status-line-preference';
import { useStatusLineVisible } from './electron-home/status-line-preference';
import { useElectronSettings } from './electron-home/useElectronSettings';
import { useLocalVaultSession } from './electron-home/useLocalVaultSession';
import { adaptLocalVaultSnapshot, LOCAL_VAULT_TEAM_PATH, toDocumentSummary } from './electron-home/local-vault-adapter';
import type { WorkspaceScope } from './electron-home/types';
import { useElectronHackmdQueries } from './electron-home/useElectronHackmdQueries';
import { useElectronFocusZones } from './electron-home/useElectronFocusZones';
import { useElectronHomeCommandPalette } from './electron-home/useElectronHomeCommandPalette';
import { useElectronHomeModel } from './electron-home/useElectronHomeModel';
import { useElectronHomeRecentNotes } from './electron-home/useElectronHomeRecentNotes';
import { useElectronHomeRefresh } from './electron-home/useElectronHomeRefresh';
import { useFolderPicker } from './electron-home/FolderPickerDialog';
import { useElectronLocalVault } from './electron-home/useElectronLocalVault';
import {
  useElectronHomeSelection,
  useElectronHomeSelectionRefs,
} from './electron-home/useElectronHomeSelection';
import {
  getQuickCaptureDraftError,
  useElectronHomeShellEffects,
  type QuickCaptureDraftResult,
} from './electron-home/useElectronHomeShellEffects';
import { useElectronNoteMutations } from './electron-home/useElectronNoteMutations';
import { useDocumentCommands } from './electron-home/useDocumentCommands';
import { useLocalDocumentRecovery } from './electron-home/useLocalDocumentRecovery';
import { useRemoteDocumentRecovery } from './electron-home/useRemoteDocumentRecovery';
import { useNoteWorkspaceTabs } from './electron-home/useNoteWorkspaceTabs';
import { createClosedFolderDialogState, createClosedRenameFolderDialogState } from './electron-home/workbench-overlays';
import { useWorkbenchOverlays } from './electron-home/useWorkbenchOverlays';
import {
  useWorkbenchActions,
} from './electron-home/useWorkbenchActions';
import { useWorkbenchActionHandlers } from './electron-home/useWorkbenchActionHandlers';
import { useWorkbenchAutoSelection } from './electron-home/useWorkbenchAutoSelection';
import { useWorkbenchClosePolicy } from './electron-home/useWorkbenchClosePolicy';
import { useWorkspaceBackupNotice } from './electron-home/useWorkspaceBackupNotice';
import { useDraftTextActions } from './electron-home/useDraftTextActions';
import { useTabImageUploads } from './electron-home/useTabImageUploads';
import { useWorkbenchDocuments } from './electron-home/useWorkbenchDocuments';
import { useElectronHomeStatus } from './electron-home/useElectronHomeStatus';
import { useWorkbenchFinder } from './electron-home/useWorkbenchFinder';
import { useWorkbenchFolderCommands } from './electron-home/useWorkbenchFolderCommands';
import { useWorkbenchNavigator } from './electron-home/useWorkbenchNavigator';
import { getNoteSearchScope, useNoteTextSearch } from './electron-home/useNoteTextSearch';
import { useWorkbenchEditorRequests } from './electron-home/useWorkbenchEditorRequests';
import { useWorkbenchPanelState } from './electron-home/useWorkbenchPanelState';
import { useWorkbenchShortcuts } from './electron-home/useWorkbenchShortcuts';
import { useWorkbenchTabLifecycle } from './electron-home/useWorkbenchTabLifecycle';
import { useHomeLocalVaultActions } from './electron-home/useHomeLocalVaultActions';
import { localVaultFolderName } from './electron-home/workspace-root-labels';
import { useHomeOverlayProps } from './electron-home/useHomeOverlayProps';
import { useHomeWorkspaceProps } from './electron-home/useHomeWorkspaceProps';
import { useWorkspaceFolderTrees } from './electron-home/useWorkspaceFolderTrees';
import { getSavedTabNoteIdentity, isBlankNoteTab, isDraftNoteTab, readNoteWorkspaceLayoutStorage, type NoteIdentity, type OpenNoteTab } from './electron-home/note-workspace';
import { closedSyncKeys, draftSyncKey, EMPTY_SYNC_ACTIVITY, isSyncSaving, noteSyncKey, syncActivityReducer } from './electron-home/note-sync-activity';
import { EMPTY_FOLDERS, EMPTY_NOTES, getScopeStorageKey } from './electron-home/repository';
import {
  DEFAULT_WORKSPACE_SCOPE,
  getInitialWorkspaceScope,
  hasWindowWorkspaceScope,
  useWorkbenchWorkspaceState,
} from './electron-home/useWorkbenchWorkspaceState';
import { getWorkspaceNavigationTeams } from './electron-home/workspace-navigation';

const EMPTY_LOCAL_VAULTS: { id: string; path: string }[] = [];
const EMPTY_VAULT_IDS: string[] = [];

export function Home() {
  const { presets, presetId, resolvedMode, setPresetId, setTheme, theme } = useTheme();
  const queryClient = useQueryClient();
  const rawApi = getDesktopAPI();
  const settingsQuery = useElectronSettings(rawApi);
  const [initialDraftsPending, setInitialDraftsPending] = useState(() => Object.keys(readNoteWorkspaceLayoutStorage(window.localStorage, INITIAL_DRAFT_SCOPE_KEY).tabs).length > 0);
  const settingsReady = settingsQuery.data !== undefined;
  const setupMissing = settingsQuery.data !== undefined && !settingsQuery.data.hasHackmdApiToken && !settingsQuery.data.hasLocalVault;
  const usingInitialDrafts = settingsReady && (initialDraftsPending || setupMissing);
  if (setupMissing && !initialDraftsPending) setInitialDraftsPending(true);
  const pendingInitialSave = useRef<string | null>(null);
  const folderPickerAction = useRef<{ type: 'note'; note: NoteSummary } | { type: 'folder'; id: string } | { type: 'create'; title: string } | null>(null);
  const beforeVaultChange = useRef<() => void>(() => {});
  const folderPicker = useFolderPicker(rawApi);
  const vaultSession = useLocalVaultSession(rawApi, settingsQuery.data, beforeVaultChange, folderPicker.pickFolder);
  const api = vaultSession.api;
  const initialWorkspaceScope = useMemo(() => getInitialWorkspaceScope(), []);
  const { recentNotes, removeRecentNoteEntry, trackRecentNote, syncLocalRecentNotes } = useElectronHomeRecentNotes(window.localStorage, vaultSession.vaultId);
  const selectionRefs = useElectronHomeSelectionRefs();
  const initialWorkspaceResolvedRef = useRef(false);
  const panelState = useWorkbenchPanelState();
  const { overlays, controls: overlayControls, closeTopOverlay } = useWorkbenchOverlays();
  const { shortcutHelp } = overlays;
  useEffect(() => {
    if (overlays.palette.open) return;
    const action = folderPickerAction.current;
    folderPickerAction.current = null;
    if (action?.type === 'create') overlayControls.set('createNote', { open: true, title: action.title });
  }, [overlays.palette.open, overlayControls]);
  const openLeaderMenu = useCallback(() => overlayControls.set('leaderPath', []), [overlayControls]);
  // The named set the open folder belongs to: its folders share one scope (tabs, search).
  const openLocalWorkspace = getActiveLocalWorkspace(settingsQuery.data);
  const localWorkspaceId = openLocalWorkspace && settingsQuery.data?.localVault.activeVaultId
    && openLocalWorkspace.vaultIds.includes(settingsQuery.data.localVault.activeVaultId)
    ? openLocalWorkspace.id
    : null;
  const workspaceState = useWorkbenchWorkspaceState({
    initialWorkspaceScope,
    localVaultId: vaultSession.vaultId,
    localWorkspaceId,
    initialDrafts: usingInitialDrafts,
    settingsReady,
    manualEmptyWorkspaceRef: selectionRefs.manualEmptyWorkspaceRef,
  });
  const {
    expandedFolderIds,
    scope,
    scopeStorageKey,
    selectedFolderId,
    setExpandedFolderIds,
    setSelectedFolderId,
    setWorkspaceScope: setWorkspaceScopeState,
  } = workspaceState;
  useEffect(() => { overlayControls.set('history', false); }, [scopeStorageKey, overlayControls]);
  const {
    inspectorCollapsed,
    navigatorCollapsed,
    navigatorWidth,
    expandNavigator,
    setNavigatorCollapsed,
    setNavigatorWidth,
    toggleInspectorCollapsed,
    toggleNavigatorCollapsed,
  } = panelState;
  // Hack Mode hides everything but the note. It is not saved, so the app always opens as usual.
  const [hackMode, setHackMode] = useState(false);
  const splitStatusLine = useSplitStatusLine();
  const statusLineVisible = useStatusLineVisible();
  // Hiding the sidebar unmounts the switcher, so it must not come back open. In Hack Mode the
  // sidebar is hidden with everything else, so the key leaves Hack Mode and shows it.
  const toggleSidebar = useCallback(() => {
    overlayControls.set('workspaceSwitcher', false);
    if (hackMode) {
      setHackMode(false);
      expandNavigator();
      return;
    }
    toggleNavigatorCollapsed();
  }, [expandNavigator, hackMode, overlayControls, toggleNavigatorCollapsed]);
  const noteWorkspace = useNoteWorkspaceTabs(scopeStorageKey, usingInitialDrafts && settingsQuery.data?.shouldShowHackmdOnboarding === true);
  const currentScopeKeyRef = useRef(scopeStorageKey);
  useLayoutEffect(() => { currentScopeKeyRef.current = scopeStorageKey; }, [scopeStorageKey]);

  const flushWorkspace = noteWorkspace.flush;
  const transferInitialDrafts = noteWorkspace.transferInitialDrafts;
  useLayoutEffect(() => { beforeVaultChange.current = flushWorkspace; }, [flushWorkspace]);
  const activeTab = noteWorkspace.activeTab;
  const { editorRequests, consumeEditorRequest, requestEditorFocus, bumpEditorSearchRequest, bumpAttachImageRequest, bumpAiAssistRequest, bumpDictateRequest, bumpRenameRequest } = useWorkbenchEditorRequests(
    scopeStorageKey && activeTab ? {
      scopeKey: scopeStorageKey,
      paneId: noteWorkspace.state.activePaneId,
      tabId: activeTab.tabId,
      documentId: getSavedTabNoteIdentity(activeTab)?.id
        ?? (isDraftNoteTab(activeTab) ? activeTab.draftId : isBlankNoteTab(activeTab) ? activeTab.tabId : activeTab.noteId),
    } : null,
  );
  // Stable, so the selection, palette and book callbacks built on it are not rebuilt every render.
  const { openNote: openNoteTab, openNoteAsPreview, showNoteInActiveTab } = noteWorkspace;
  const openNoteInWorkspace = useCallback((note: NoteSummary, options?: { inPlace?: InPlaceTarget; preview?: boolean }) => {
    const inPlace = options?.inPlace;
    if (inPlace) {
      showNoteInActiveTab(note, typeof inPlace === 'object' ? inPlace.tabId : undefined);
    } else if (options?.preview) {
      openNoteAsPreview(note);
    } else {
      openNoteTab(note);
    }
  }, [openNoteAsPreview, openNoteTab, showNoteInActiveTab]);
  const {
    autoSelectSuppressionRef,
    handleNoteKeep,
    handleNoteSelect,
    manualEmptyWorkspaceRef,
    requestSelectNote,
    selectedNote,
  } = useElectronHomeSelection({
    activeTab,
    activePaneId: noteWorkspace.state.activePaneId,
    getNotePaneId: note => {
      const existing = noteWorkspace.getTabsMatching(note)[0];
      return existing ? noteWorkspace.getTabHostPane(existing.tabId)?.paneId : undefined;
    },
    requestEditorFocus,
    scopeStorageKey,
    openNoteInWorkspace,
    keepNoteInWorkspace: noteWorkspace.keepNote,
    selectionRefs,
    trackRecentNote,
  });
  const {
    activeFinderState,
    deferredFinderState,
    finderActive,
    focusWorkspaceSearch,
    setFinderState,
  } = useWorkbenchFinder({
    initialScopeStorageKey: workspaceState.initialScopeStorageKey,
    scopeStorageKey,
    selectedFolderId,
    setNavigatorCollapsed,
  });
  const setWorkspaceScope = useCallback((nextScope: WorkspaceScope) => {
    if (usingInitialDrafts) {
      if (nextScope.type === 'history') return;
      const configured = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
      const next = nextScope.type === 'local' ? { ...nextScope, vaultId: nextScope.vaultId ?? vaultSession.vaultId ?? undefined } : nextScope;
      const targetKey = next.type === 'local' || configured?.hasHackmdApiToken ? getScopeStorageKey(next) : null;
      if (!targetKey) return;
      transferInitialDrafts(targetKey, pendingInitialSave.current);
      setInitialDraftsPending(false);
    } else {
      flushWorkspace();
    }
    setWorkspaceScopeState(nextScope);
  }, [flushWorkspace, transferInitialDrafts, queryClient, setWorkspaceScopeState, usingInitialDrafts, vaultSession.vaultId]);
  const handleOnboardingConnected = useCallback(() => {
    setWorkspaceScope(DEFAULT_WORKSPACE_SCOPE);
  }, [setWorkspaceScope]);
  const { focusZone, focusNextZone, focusedZone, getLastFocusedTarget, hasPendingFocus } = useElectronFocusZones();
  // A dismissed dialog hands focus back to the open note's editor, so writing can go on (#322),
  // unless the command it ran is about to move focus somewhere else.
  const getDialogReturnFocus = useCallback(() => (hasPendingFocus() ? false : document.querySelector<HTMLElement>(
    '[data-active-pane="true"] [data-hackdesk-focus="editor"] .cm-content[data-hackdesk-focus-target="true"]',
  )), [hasPendingFocus]);
  const initialFocusGiven = useRef(false);
  useEffect(() => {
    if (usingInitialDrafts && activeTab && !initialFocusGiven.current) {
      initialFocusGiven.current = true;
      focusZone('editor');
    }
  }, [usingInitialDrafts, activeTab, focusZone]);
  const openKeyboardShortcuts = useCallback(() => {
    overlayControls.set('shortcutHelp', { region: focusedZone, target: getLastFocusedTarget() });
  }, [focusedZone, getLastFocusedTarget, overlayControls]);
  // Note Details floats over the note: opening it moves focus inside, and closing it from inside
  // returns to the note rather than leaving focus nowhere.
  const toggleNoteDetails = useCallback(() => {
    const active = document.activeElement;
    const leavingDetails = !active || active === document.body || Boolean(active.closest('[data-hackdesk-focus="inspector"]'));
    toggleInspectorCollapsed();
    if (inspectorCollapsed) focusZone('inspector');
    else if (leavingDetails) focusZone('editor');
  }, [focusZone, inspectorCollapsed, toggleInspectorCollapsed]);
  const toggleHackMode = useCallback(() => {
    if (hackMode) {
      setHackMode(false);
      return;
    }
    setHackMode(true);
    const shortcut = getResolvedActionShortcut('toggle-hack-mode', settingsQuery.data?.shortcuts, api?.platform ?? navigator.platform);
    toast.info(shortcut ? `Hack Mode · Press ${shortcut.split(', ')[0]} to leave` : 'Hack Mode');
    if (!document.activeElement?.closest('[data-hackdesk-focus="editor"]')) focusZone('editor');
  }, [api?.platform, focusZone, hackMode, settingsQuery.data?.shortcuts]);
  const togglePaneZoom = useCallback(() => {
    const zooming = !noteWorkspace.state.zoomedPaneId;
    noteWorkspace.togglePaneZoom();
    if (!zooming) return;
    const shortcut = getResolvedActionShortcut('toggle-pane-zoom', settingsQuery.data?.shortcuts, api?.platform ?? navigator.platform);
    toast.info(shortcut ? `Pane zoomed · Press ${shortcut.split(', ')[0]} to restore` : 'Pane zoomed');
  }, [api?.platform, noteWorkspace, settingsQuery.data?.shortcuts]);
  // Actions that need the hidden sidebar leave Hack Mode first.
  const focusZoneShowingSidebar = useCallback((...[zone, options]: Parameters<typeof focusZone>) => {
    if (zone === 'navigator') setHackMode(false);
    focusZone(zone, options);
  }, [focusZone]);
  const activeDocumentNotes = useMemo(() => (
    noteWorkspace.visibleActiveTabs
      .map(getSavedTabNoteIdentity)
      .filter((note): note is NonNullable<typeof note> => Boolean(note))
  ), [noteWorkspace.visibleActiveTabs]);

  const {
    settings,
    hasToken,
    user,
    teams,
    currentNotes: remoteNotes,
    currentFolders: remoteFolders,
    currentFolderOrder: remoteFolderOrder,
    documentsByKey: remoteDocumentsByKey,
    documentQueries: remoteDocumentQueries,
    queries: remoteQueries,
  } = useElectronHackmdQueries({
    api,
    settingsQuery,
    scope,
    selectedNote,
    activeDocumentNotes,
  });
  // Every folder of the open set, each with its own tree; their notes open like the open folder's.
  const workspaceFolders = useWorkspaceFolderTrees({
    api,
    activeSnapshot: vaultSession.snapshot,
    activeSnapshotPath: vaultSession.snapshotPath,
    activeVaultId: settingsQuery.data?.localVault.activeVaultId ?? null,
    enabled: !!localWorkspaceId && scope.type === 'local',
    vaultIds: localWorkspaceId && scope.type === 'local' ? openLocalWorkspace?.vaultIds ?? [] : EMPTY_VAULT_IDS,
    vaults: settingsQuery.data?.localVault.vaults ?? EMPTY_LOCAL_VAULTS,
  });
  const workspaceSnapshots = useMemo(
    () => workspaceFolders.flatMap((folder) => (folder.snapshot ? [folder.snapshot] : [])),
    [workspaceFolders],
  );
  const localDocuments = useElectronLocalVault({
    api,
    enabled: !!vaultSession.snapshot && !vaultSession.isChanging && scope.type === 'local',
    snapshot: vaultSession.snapshot,
    workspaceSnapshots,
    selectedNote,
    activeDocumentNotes,
  });
  const localVault = { ...localDocuments, snapshotQuery: vaultSession.snapshotQuery };
  const snapshotForLocalNote = localDocuments.snapshotForNote;
  // A tab can hold a note from any folder of the set, so changes on disk are watched in all of them.
  const workspaceLocalNotes = useMemo(() => {
    const others = workspaceSnapshots.filter((other) => other.vaultId !== vaultSession.snapshot?.vaultId);
    return others.length
      ? [...localVault.currentNotes, ...others.flatMap((other) => adaptLocalVaultSnapshot(other).notes)]
      : localVault.currentNotes;
  }, [localVault.currentNotes, vaultSession.snapshot?.vaultId, workspaceSnapshots]);
  const localVaultActions = useHomeLocalVaultActions({
    api,
    queryClient,
    scopeType: scope.type,
    refetchLocalVault: async () => {
      if (vaultSession.isChanging) throw new Error('Local Vault is still loading. Try again when it is ready.');
      await localVault.snapshotQuery.refetch();
    },
    setWorkspaceScope,
  });
  const currentNotes = usingInitialDrafts ? EMPTY_NOTES : scope.type === 'local' ? localVault.currentNotes : remoteNotes;
  const currentFolders = usingInitialDrafts ? EMPTY_FOLDERS : scope.type === 'local' ? localVault.currentFolders : remoteFolders;
  const currentFolderOrder = scope.type === 'local' ? undefined : remoteFolderOrder;
  const documentsByKey = scope.type === 'local' ? localVault.documentsByKey : remoteDocumentsByKey;
  useEffect(() => { syncLocalRecentNotes(localVault.currentNotes); }, [localVault.currentNotes, syncLocalRecentNotes]);
  const documentQueries = scope.type === 'local' ? localVault.documentQueries : remoteDocumentQueries;
  const queries = remoteQueries;
  const isWorkspaceFetching = scope.type === 'local'
    ? localVault.snapshotQuery.isFetching
    : queries.notesQuery.isFetching;
  const isWorkspaceLoading = scope.type === 'local'
    ? vaultSession.isLoading || localVault.snapshotQuery.isError || !!vaultSession.error
    : queries.notesQuery.isLoading;
  const hasConfiguredLocalVault = settings?.hasLocalVault === true;
  const canUseCurrentWorkspace = !usingInitialDrafts && (scope.type === 'local' ? !!vaultSession.snapshot && !vaultSession.isChanging : hasToken);
  const handleHackmdDisconnected = useCallback(() => {
    if (settings?.hasLocalVault) {
      const activePath = getActiveLocalVaultPath(settings);
      setWorkspaceScope({
        type: 'local',
        label: activePath ? localVaultFolderName(activePath) : 'Local Vault',
        vaultId: settings.localVault.activeVaultId ?? undefined,
      });
      return;
    }
    setWorkspaceScope(DEFAULT_WORKSPACE_SCOPE);
  }, [settings, setWorkspaceScope]);

  const { switchLocalVault, activateLocalWorkspace } = localVaultActions;
  useEffect(() => {
    if (settings === undefined || usingInitialDrafts || initialWorkspaceResolvedRef.current) {
      return;
    }

    initialWorkspaceResolvedRef.current = true;
    // A window opened onto an explicit workspace keeps it; the local preference is only for fresh boots.
    if (settings.hasLocalVault && scope.type !== 'local' && initialWorkspaceScope.type === 'personal' && !hasWindowWorkspaceScope()) {
      const activePath = getActiveLocalVaultPath(settings);
      setWorkspaceScope({
        type: 'local',
        label: activePath ? localVaultFolderName(activePath) : 'Local Vault',
        vaultId: settings.localVault.activeVaultId ?? undefined,
      });
    }
    // A new window opened onto another vault or a named workspace activates it so the window shows
    // what it was opened onto. Only a window URL names a stored vault or workspace id; the saved
    // last scope holds a snapshot id, which never equals a stored one, so trusting it re-opened the
    // folder (and left its workspace) on every launch.
    const openedOnto = initialWorkspaceScope.type === 'local' && hasWindowWorkspaceScope()
      ? initialWorkspaceScope.vaultId
      : undefined;
    if (settings.hasLocalVault && openedOnto
      && settings.localVault.vaults.some((vault) => vault.id === openedOnto)
      && openedOnto !== settings.localVault.activeVaultId && !vaultSession.isChanging) {
      void switchLocalVault(openedOnto).catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to open the vault in a new window.');
      });
    }
    const openedWorkspaceId = initialWorkspaceScope.type === 'local' && hasWindowWorkspaceScope()
      ? initialWorkspaceScope.workspaceId
      : undefined;
    if (settings.hasLocalVault && openedWorkspaceId
      && settings.localVault.workspaces.some((workspace) => workspace.id === openedWorkspaceId)
      && openedWorkspaceId !== settings.localVault.activeWorkspaceId && !vaultSession.isChanging) {
      void activateLocalWorkspace(openedWorkspaceId).catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to open the workspace in a new window.');
      });
    }
  }, [activateLocalWorkspace, initialWorkspaceScope, scope.type, setWorkspaceScope, settings, switchLocalVault, usingInitialDrafts, vaultSession.isChanging]);

  // Only the active vault's path names the scope, so other settings changes do not move drafts again.
  const initialDraftsVaultPath = settings ? getActiveLocalVaultPath(settings) : null;
  useEffect(() => {
    if (!usingInitialDrafts || vaultSession.isChanging) return;
    const activePath = initialDraftsVaultPath;
    const target: WorkspaceScope | null = settings?.hasLocalVault
      ? vaultSession.vaultId ? { type: 'local', label: activePath ? localVaultFolderName(activePath) : 'Local Vault', vaultId: vaultSession.vaultId } : null
      : hasToken ? DEFAULT_WORKSPACE_SCOPE : null;
    if (!target) return;
    try { setWorkspaceScope(target); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to move drafts.'); }
  }, [usingInitialDrafts, settings?.hasLocalVault, initialDraftsVaultPath, hasToken, vaultSession.vaultId, vaultSession.isChanging, setWorkspaceScope]);

  const {
    displayScope,
    folderTree,
    selectedParentFolderIdForMutation,
  } = useElectronHomeModel({
    currentFolderOrder,
    currentFolders,
    currentNotes,
    scope,
    localVaultPath: settingsQuery.data ? getActiveLocalVaultPath(settingsQuery.data) : null,
    localWorkspaceName: (() => {
      const workspace = getActiveLocalWorkspace(settingsQuery.data);
      const activeVaultId = settingsQuery.data?.localVault.activeVaultId;
      return workspace && activeVaultId && workspace.vaultIds.includes(activeVaultId) ? workspace.name : null;
    })(),
    selectedFolderId,
    syncOpenNoteSummaries: noteWorkspace.syncNoteSummaries,
    teams,
  });
  // Tabs show the same hover card as the tree, so they look notes up by ID.
  const noteSummariesById = useMemo(() => new Map(folderTree.allNotes.map((entry) => [entry.note.id, entry])), [folderTree.allNotes]);
  const lookupNoteSummary = useCallback((noteId: string) => noteSummariesById.get(noteId), [noteSummariesById]);
  const teamNamesByPath = useMemo(() => new Map(teams.map((team) => [team.path, team.name])), [teams]);
  const lookupTeamName = useCallback((teamPath: string) => teamNamesByPath.get(teamPath), [teamNamesByPath]);
  // Folders start collapsed: the stored set is the folders you opened, and every other folder in
  // the tree reads as collapsed. Callers keep working in collapsed terms through this adapter.
  const allFolderIds = useMemo(() => [...folderTree.nodesById.keys()], [folderTree.nodesById]);
  const collapsedFolderIds = useMemo(
    () => new Set(allFolderIds.filter((id) => !expandedFolderIds.has(id))),
    [allFolderIds, expandedFolderIds],
  );
  const setCollapsedFolderIds = useCallback((update: SetStateAction<Set<string>>) => {
    setExpandedFolderIds((currentExpanded) => {
      const currentCollapsed = new Set(allFolderIds.filter((id) => !currentExpanded.has(id)));
      const nextCollapsed = typeof update === 'function' ? update(currentCollapsed) : update;
      if (nextCollapsed === currentCollapsed) return currentExpanded;
      const next = new Set(currentExpanded);
      for (const id of allFolderIds) {
        if (nextCollapsed.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [allFolderIds, setExpandedFolderIds]);

  // Each note's own save, delete and upload progress; one tab's work never shows on another (#360).
  const [syncActivity, dispatchSyncActivity] = useReducer(syncActivityReducer, EMPTY_SYNC_ACTIVITY);
  const clearSaveFailure = useCallback((identity: NoteIdentity) => {
    dispatchSyncActivity({ type: 'save_failure_cleared', key: noteSyncKey(identity) });
  }, []);
  // When a note's or draft's last tab closes, its save is over: the edits were discarded or saved
  // another way, and a save still in flight must not mark the note when it settles. Switching
  // workspace swaps the tabs without closing them, so it keeps them.
  const { scopeKey: tabsScopeKey, tabs: openTabs } = noteWorkspace.state;
  const previousTabsRef = useRef({ scope: tabsScopeKey, tabs: openTabs });
  useEffect(() => {
    const previous = previousTabsRef.current;
    previousTabsRef.current = { scope: tabsScopeKey, tabs: openTabs };
    if (previous.scope !== tabsScopeKey) return;
    for (const key of closedSyncKeys(previous.tabs, openTabs)) {
      dispatchSyncActivity({ type: 'save_abandoned', key });
    }
  }, [openTabs, tabsScopeKey]);
  // Save commands wait only for the active tab's own save, not for another tab's.
  const activeTabIdentity = activeTab && !isDraftNoteTab(activeTab) ? getSavedTabNoteIdentity(activeTab) : null;
  const isSavingActiveTab = activeTab
    ? isSyncSaving(syncActivity, isDraftNoteTab(activeTab) ? draftSyncKey(activeTab.tabId) : activeTabIdentity ? noteSyncKey(activeTabIdentity) : '')
    : false;
  const mutations = useElectronNoteMutations({
    api,
    onSyncActivity: dispatchSyncActivity,
    scope,
    selectedNote,
    selectedParentFolderId: selectedParentFolderIdForMutation,
    onSettingsSaved: () => overlayControls.close('settings'),
    onNoteCreated: (note) => {
      if (currentScopeKeyRef.current !== scopeStorageKey) {
        noteWorkspace.openNote(note);
        trackRecentNote(note);
        return;
      }
      overlayControls.set('createNote', { open: false, title: '' });
      void requestSelectNote(note, { trackRecent: true });
    },
    onDraftNoteCreated: (tabId, note, submittedDraft) => {
      noteWorkspace.materializeDraftNote(tabId, note, submittedDraft);
      noteWorkspace.syncNoteSummary(note);
      trackRecentNote(note);
    },
    onNoteSaved: (note, variables) => {
      if (variables.intent === 'content' && variables.tabId && variables.submittedDraft) {
        noteWorkspace.reconcileSavedNote({
          note,
          tabId: variables.tabId,
          submittedDraft: variables.submittedDraft,
        });
      } else {
        noteWorkspace.syncNoteSummary(note);
      }
      trackRecentNote(note);
    },
    onFolderCreated: (folder: FolderSummary) => {
      if (currentScopeKeyRef.current !== scopeStorageKey) return;
      overlayControls.set('createFolder', createClosedFolderDialogState());
      if (folder.id) {
        setSelectedFolderId(folder.id);
      }
    },
    onFolderRenamed: (folder: FolderSummary) => {
      if (currentScopeKeyRef.current !== scopeStorageKey) return;
      overlayControls.set('renameFolder', createClosedRenameFolderDialogState());
      if (folder.id) {
        setSelectedFolderId(folder.id);
      }
    },
    onFolderDeleted: (_folderId, parentFolderId) => {
      if (currentScopeKeyRef.current !== scopeStorageKey) return;
      overlayControls.set('deleteFolder', null);
      setSelectedFolderId(parentFolderId ?? UNFILED_FOLDER_ID);
    },
    onNoteDeleted: (note) => {
      dispatchSyncActivity({ type: 'save_abandoned', key: noteSyncKey(note) });
      removeRecentNoteEntry(note.id, note.teamPath ?? null);
      noteWorkspace.closeByNoteIdentity(note);
      if (currentScopeKeyRef.current === scopeStorageKey) overlayControls.set('deleteNote', null);
    },
    onNoteMoved: (note, targetFolderId) => {
      noteWorkspace.syncNoteSummary(note);
      if (currentScopeKeyRef.current !== scopeStorageKey) return;
      setSelectedFolderId(targetFolderId ?? UNFILED_FOLDER_ID);
      void requestSelectNote(note, { trackRecent: true });
    },
  });
  const saveDraftNote = useCallback((tab: OpenNoteTab, input: { title?: string; content?: string }) => {
    if (usingInitialDrafts) {
      if (!flushWorkspace()) {
        toast.error('HackDesk could not back up this draft. Your text is still here.');
        return;
      }
      pendingInitialSave.current = tab.tabId;
      overlayControls.set('destination', true);
    } else {
      mutations.createDraftNoteMutation.mutate({ tabId: tab.tabId, input });
    }
  }, [flushWorkspace, mutations.createDraftNoteMutation, overlayControls, usingInitialDrafts]);
  useEffect(() => {
    const tabId = pendingInitialSave.current;
    if (usingInitialDrafts || !tabId || !scopeStorageKey || noteWorkspace.state.scopeKey !== scopeStorageKey) return;
    pendingInitialSave.current = null;
    const tab = noteWorkspace.state.tabs[tabId];
    if (!isDraftNoteTab(tab)) return;
    const draft = noteWorkspace.state.drafts[tabId];
    mutations.createDraftNoteMutation.mutate({ tabId, input: { title: draft?.title ?? tab.title, content: draft?.content ?? '' } });
    requestEditorFocus();
  }, [usingInitialDrafts, scopeStorageKey, noteWorkspace.state, mutations.createDraftNoteMutation, requestEditorFocus]);
  const localDocumentRecovery = useLocalDocumentRecovery({
    api,
    clearDraft: noteWorkspace.clearDraft,
    documentQueries: localVault.documentQueries,
    drafts: noteWorkspace.state.drafts,
    enabled: scope.type === 'local' && !!vaultSession.vaultId && !vaultSession.isChanging,
    getTabsMatching: noteWorkspace.getTabsMatching,
    notes: workspaceLocalNotes,
    openNote: noteWorkspace.openNote,
    snapshotForNote: snapshotForLocalNote,
    clearSaveFailure,
    syncNoteSummary: noteWorkspace.syncNoteSummary,
    tabs: noteWorkspace.state.tabs,
    trackRecentNote,
  });
  const remoteDocumentRecovery = useRemoteDocumentRecovery({
    clearDraft: noteWorkspace.clearDraft,
    documentQueries: remoteDocumentQueries,
    getTabsMatching: noteWorkspace.getTabsMatching,
    clearSaveFailure,
  });
  const textSearch = useNoteTextSearch(scope, finderActive ? deferredFinderState.query : '', folderTree);
  const workbenchNavigator = useWorkbenchNavigator({
    canUseHackmd: canUseCurrentWorkspace,
    deferredFinderState,
    expandNavigator,
    finderActive,
    focusNavigator: () => focusZone('navigator'),
    moveNote: (operation) => {
      mutations.moveNoteMutation.mutate({
        note: operation.note.note,
        targetFolderId: operation.targetFolderId,
      });
    },
    requestSelectNote,
    scopeType: scope.type,
    selectedFolderId,
    setCollapsedFolderIds,
    setFinderState,
    setSelectedFolderId,
    textSearch,
    tree: folderTree,
  });
  const {
    canCreate,
    canModifySelectedFolder,
    handleShowFinderResults,
    revealFolderIds,
    revealNoteEntry,
    selectedFolder,
    selectedFolderLabel,
    selectedParentFolderId,
    visibleEntries,
  } = workbenchNavigator;
  // The note header's location: a folder opens, is selected and takes focus in the tree; the
  // workspace selects none and focuses the sidebar. Any search, filter, scope or sort shows results
  // instead of the tree, so the finder goes back to its defaults first.
  const revealFolder = useCallback((folderIds: string[]) => {
    const folderId = folderIds.at(-1);
    setFinderState(DEFAULT_NOTE_FINDER_STATE);
    expandNavigator();
    revealFolderIds(folderIds);
    setSelectedFolderId(folderId ?? null);
    if (!folderId) {
      focusZone('navigator');
      return;
    }
    // The opened folders, and the tree in place of search results, render over the next frames.
    const focusRow = (framesLeft: number) => window.requestAnimationFrame(() => {
      const row = window.document.querySelector<HTMLElement>(`[data-folder-tree-folder-id="${CSS.escape(folderId)}"] [role="treeitem"]`);
      if (row) row.focus();
      else if (framesLeft > 0) focusRow(framesLeft - 1);
      else focusZone('navigator');
    });
    focusRow(10);
  }, [expandNavigator, focusZone, revealFolderIds, setFinderState, setSelectedFolderId]);
  const { getAutoSelectSuppressionKey } = useWorkbenchAutoSelection({
    autoSelectSuppressionRef,
    hasActiveDocument: Boolean(activeTab),
    manualEmptyWorkspaceRef,
    requestSelectNote,
    scopeStorageKey,
    selectedFolderId,
    selectedNote,
    visibleEntries,
  });
  const workbenchDocuments = useWorkbenchDocuments({
    activeTab,
    clearDraft: noteWorkspace.clearDraft,
    documentQueriesByKey: documentQueries.byKey,
    documentsByKey,
    drafts: noteWorkspace.state.drafts,
    latestLocalRevisionByNoteId: localDocumentRecovery.latestLocalRevisionByNoteId,
    syncActivity,
    tabs: noteWorkspace.state.tabs,
    updateDraft: noteWorkspace.updateDraft,
  });
  const {
    documentContent,
    documentTitle,
    getTabSyncState,
    getTabTitle,
    isTabDirty,
    noteDirty,
    selectedDocument,
  } = workbenchDocuments;

  const refreshWorkspace = useElectronHomeRefresh({
    localVaultQuery: localVault.snapshotQuery,
    queries,
    scopeType: scope.type,
  });

  const noteTemplates = useNoteTemplates({
    api,
    folderTree,
    openDraftNote: (draft) => {
      noteWorkspace.openDraftNote(draft);
      focusZone('editor');
    },
    saveAsTemplate: mutations.saveAsTemplateMutation.mutate,
  });

  const folderCommands = useWorkbenchFolderCommands({
    currentFolders,
    folderTree,
    hasLocalVault: hasConfiguredLocalVault,
    hasToken,
    canStartDraft: usingInitialDrafts,
    moveFolder: mutations.moveFolderMutation.mutate,
    onChooseLocalVault: () => {
      void localVaultActions.chooseLocalVault();
    },
    openDraftNote: () => {
      noteWorkspace.openDraftNote();
      focusZone('editor');
    },
    openTemplatePicker: () => noteTemplates.setPickerOpen(true),
    scopeType: scope.type,
    setSelectedFolderId,
    overlays: overlayControls,
  });

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
    documentContent,
    documentTitle,
    duplicateNote: mutations.duplicateNoteMutation.mutate,
    importMarkdownNote: mutations.importMarkdownNoteMutation.mutate,
    scopeType: scope.type,
    selectedDocument,
    selectedNote,
    selectedParentFolderId,
    overlays: overlayControls,
    trackRecentNote,
  });

  const {
    commandPaletteProps,
    openPalette,
    openQuickOpen,
    openNoteTarget,
    switchWorkspaceScope,
  } = useElectronHomeCommandPalette({
    localVaultId: vaultSession.vaultId,
    localVaultEntryId: settingsQuery.data?.localVault.activeVaultId ?? null,
    localVaults: settingsQuery.data?.localVault.vaults ?? [],
    onSwitchLocalVault: (vaultId: string) => {
      void localVaultActions.switchLocalVault(vaultId).catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to switch local vault.');
      });
    },
    displayScope,
    expandNavigator,
    focusNavigator: () => focusZone('navigator'),
    handleShowFinderResults,
    isWorkspaceFetching,
    isWorkspaceLoading,
    palette: overlays.palette,
    recentNotes,
    removeRecentNoteEntry,
    requestSelectNote,
    revealFolderIds,
    revealNoteEntry,
    scope,
    selectedFolderId,
    selectedNoteId: selectedNote?.id ?? null,
    overlays: overlayControls,
    setSelectedFolderId,
    setWorkspaceScope,
    teams,
    tree: folderTree,
  });
  const bookSession = useBookSession({ document: selectedDocument, activeTabId: noteWorkspace.activeTab?.tabId ?? null, openNoteTarget, openExternal: handleOpenExternal });
  // A book is read in its tab; closing that tab closes the book.
  const bookTabOpen = bookSession.tabId ? Boolean(noteWorkspace.state.tabs[bookSession.tabId]) : true;
  const closeBook = bookSession.close;
  useEffect(() => {
    if (!bookTabOpen) closeBook();
  }, [bookTabOpen, closeBook]);
  const askNotesScope = getNoteSearchScope(scope);
  const askNotes = useAskNotes(askNotesScope);

  const {
    confirmCloseUnsafeTabs,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
  } = useWorkbenchTabLifecycle({
    activePaneId: noteWorkspace.state.activePaneId,
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

  const activePaneTabIds = noteWorkspace.state.panes.find(pane => pane.paneId === noteWorkspace.state.activePaneId)?.tabIds ?? [];
  const actionHandlers = useWorkbenchActionHandlers({
    activePaneTabIds,
    openLeaderMenu,
    book: bookSession,
    chooseLocalVault: () => {
      void localVaultActions.chooseLocalVault();
    },
    copyNoteLink: handleCopyNoteLink,
    copyNoteMarkdownLink: handleCopyNoteMarkdownLink,
    duplicateNote: handleDuplicateNote,
    openMoveNotePicker: () => { folderPickerAction.current = null; overlayControls.set('palette', { mode: 'move-note', open: true, search: '' }); },
    openShare: () => overlayControls.set('share', true),
    reorderTab: noteWorkspace.reorderTab,
    revealLocalNote: localVaultActions.revealLocalNote,
    revealLocalVault: localVaultActions.openLocalVault,
    openKeyboardShortcuts,
    focusNextRegion: focusNextZone,
    activePaneId: noteWorkspace.state.activePaneId,
    activeTab,
    bumpAttachImageRequest,
    bumpRenameRequest,
    bumpAiAssistRequest,
    bumpDictateRequest,
    bumpEditorSearchRequest,
    api,
    createFolder: folderCommands.handleCreateFolder,
    createNote: folderCommands.handleCreateNote,
    createNoteFromTemplate: folderCommands.handleCreateNoteFromTemplate,
    askNotes: () => {
      if (!askNotesScope) toast.info('Ask Your Notes works in a workspace or Local Vault, not History.');
      else if (!askNotes.available) toast.info('Turn on Codex or Claude in Settings › AI to ask your notes.');
      else askNotes.setOpen(true);
    },
    saveAsTemplate: () => noteTemplates.saveDocumentAsTemplate(selectedDocument, { title: documentTitle, content: documentContent }),
    deleteNote: handleDeleteRequest,
    documentContent,
    documentTitle,
    duplicateActiveTab: noteWorkspace.duplicateActiveTab,
    openBlankTab: noteWorkspace.openBlankTab,
    exportMarkdown: handleExportMarkdown,
    focusNextPane: noteWorkspace.focusNextPane,
    focusPaneToward: noteWorkspace.focusPaneToward,
    togglePaneZoom,
    equalizePanes: noteWorkspace.equalizePanes,
    splitActivePaneDown: noteWorkspace.splitActivePaneDown,
    focusNextTab: noteWorkspace.focusNextTab,
    focusPreviousPane: noteWorkspace.focusPreviousPane,
    focusPreviousTab: noteWorkspace.focusPreviousTab,
    focusWorkspaceSearch: () => {
      setHackMode(false);
      focusWorkspaceSearch();
    },
    focusZone: focusZoneShowingSidebar,
    importMarkdownNote: handleImportMarkdownNote,
    isSavingNote: isSavingActiveTab,
    moveActiveTabToOtherPane: noteWorkspace.moveActiveTabToOtherPane,
    navigateBack: noteWorkspace.navigateBack,
    navigateForward: noteWorkspace.navigateForward,
    noteDirty,
    openPalette,
    openQuickOpen,
    refreshWorkspace,
    renameFolder: folderCommands.handleRenameFolder,
    requestCloseOtherTabs,
    requestCloseTab,
    requestCloseTabsToRight,
    requestDeleteFolder: folderCommands.handleDeleteFolderRequest,
    reopenLastClosedTab: noteWorkspace.reopenLastClosed,
    saveNote: (note, input) => {
      if (!activeTab || isDraftNoteTab(activeTab)) {
        return;
      }
      mutations.updateNoteMutation.mutate({
        note,
        input,
        intent: 'content',
        tabId: activeTab.tabId,
        submittedDraft: { ...noteWorkspace.state.drafts[activeTab.tabId], ...input },
      });
    },
    saveDraftNote,
    setEditorMode: (mode) => {
      mutations.updateSettingsMutation.mutate({
        title: settings?.title ?? defaultSettings.title,
        editor: { mode },
      });
      focusZone('editor');
    },
    selectedDocument,
    selectedFolderId: selectedFolder?.id ?? null,
    overlays: overlayControls,
    splitActiveTab: noteWorkspace.splitActiveTab,
    switchToHistory: () => { if (scope.type !== 'local') { overlayControls.set('history', true); } },
    toggleInspector: toggleNoteDetails,
    toggleKeyHints: () => {
      const keyboardNavigation = settings?.keyboardNavigation ?? defaultSettings.keyboardNavigation;
      mutations.updateSettingsMutation.mutate({
        title: settings?.title ?? defaultSettings.title,
        keyboardNavigation: { ...keyboardNavigation, keyHintsVisible: !(keyboardNavigation.keyHintsVisible ?? true) },
      });
    },
    toggleNavigator: toggleSidebar,
    toggleTheme: () => setTheme(resolvedMode === 'dark' ? 'light' : 'dark'),
    openWorkspaceSwitcher: () => {
      setHackMode(false);
      expandNavigator();
      overlayControls.set('workspaceSwitcher', true);
    },
    toggleHackMode,
    // Sort, scope and filters live in the sidebar's View options menu; show the sidebar and open it.
    openViewOptions: () => {
      setHackMode(false);
      expandNavigator();
      window.requestAnimationFrame(() => {
        window.document.querySelector<HTMLButtonElement>('#note-navigator-panel button[aria-label="View options"]')?.click();
      });
    },
    trackRecentNote,
  });

  const { actionContext, runAction } = useWorkbenchActions({
    canStartDraft: usingInitialDrafts,
    bookContentsHidden: bookSession.contentsHidden,
    bookOpen: bookSession.book !== null,
    canCreate,
    hasLocalVault: hasConfiguredLocalVault,
    canModifySelectedFolder,
    editorMode: settings?.editor?.mode ?? defaultSettings.editor.mode,
    hasActiveTab: Boolean(activeTab),
    handlers: actionHandlers,
    hasToken: canUseCurrentWorkspace,
    inspectorCollapsed,
    isSavingNote: isSavingActiveTab,
    keyHintsVisible: settings?.keyboardNavigation?.keyHintsVisible ?? true,
    hackMode,
    navigatorCollapsed,
    noteDirty,
    scopeType: scope.type,
    selectedFolderId,
    selectedNoteId: selectedNote?.id ?? null,
    workspaceState: noteWorkspace.state,
  });

  // A shortcut with nothing to do does nothing, as in other editors, instead of explaining itself.
  const runShortcutAction = useCallback((id: Parameters<typeof runAction>[0]) => runAction(id, { quiet: true }), [runAction]);
  const runPaletteAction = useCallback((id: Parameters<typeof runAction>[0]) => {
    const context = getElectronAction(id).keyboardContext;
    if (context === 'region' || context === 'scroll') {
      const target = getLastFocusedTarget();
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus();
        runAction(id);
      });
      return true;
    }
    return runAction(id);
  }, [runAction, getLastFocusedTarget]);

  useWorkbenchClosePolicy({
    api,
    backupFailed: noteWorkspace.backupFailed,
    closeTransientLayer: closeTopOverlay,
    confirmCloseUnsafeTabs,
    openTabs: noteWorkspace.state.tabs,
  });

  const openQuickCaptureDraft = useCallback((content: string): QuickCaptureDraftResult => {
    if (!content.trim()) {
      return { accepted: false, error: 'Write something before capturing.' };
    }

    const guardError = getQuickCaptureDraftError({
      scopeType: scope.type,
      hasToken,
      hasConfiguredLocalVault,
      isLocalVaultReady: !!vaultSession.vaultId && !vaultSession.isChanging,
    });
    if (guardError) {
      return { accepted: false, error: guardError };
    }

    try {
      noteWorkspace.openRecoverableDraftNote({ content });
    } catch (error) {
      return { accepted: false, error: error instanceof Error ? error.message : 'HackDesk could not save this capture. Your text is still here.' };
    }
    focusZone('editor');
    return { accepted: true };
  }, [
    focusZone,
    hasConfiguredLocalVault,
    hasToken,
    noteWorkspace,
    vaultSession.vaultId,
    vaultSession.isChanging,
    scope.type,
  ]);

  // Folders start collapsed, so open the ones above the open note: it stays visible in the tree.
  const selectedNoteFolderIds = useMemo(() => folderTree.allNotes
    .find((candidate) => candidate.note.id === selectedNote?.id)?.folderPath.map((folder) => folder.id) ?? [],
  [folderTree.allNotes, selectedNote?.id]);
  useEffect(() => {
    if (!selectedNoteFolderIds.length) return;
    setExpandedFolderIds((current) => (selectedNoteFolderIds.every((id) => current.has(id))
      ? current
      : new Set([...current, ...selectedNoteFolderIds])));
  }, [selectedNoteFolderIds, setExpandedFolderIds]);

  useElectronHomeShellEffects({
    api,
    expandedFolderIds,
    openQuickCaptureDraft,
    runAction,
    folderStateKey: workspaceState.folderStateKey,
  });

  const openHackmdTokenSetup = useCallback(() => {
    overlayControls.set('onboarding', true);
  }, [overlayControls]);
  const openSettingsTab = overlayControls.openSettings;
  const { handleNoteMove } = workbenchNavigator;
  const moveSelectedNoteToFolder = useCallback((folder: QuickOpenFolderResult) => {
    const action = folderPickerAction.current;
    const targetFolderId = folder.id === UNFILED_FOLDER_ID ? null : folder.id;
    if (action?.type === 'create') { setSelectedFolderId(targetFolderId ?? UNFILED_FOLDER_ID); return; }
    folderPickerAction.current = null;
    if (action?.type === 'folder') {
      const node = folderTree.nodesById.get(action.id);
      const destination = targetFolderId ? folderTree.nodesById.get(targetFolderId) : null;
      if (!node || targetFolderId === node.id || destination?.folderPath.some((part) => part.id === node.id)) { toast.error('Choose a folder outside the folder being moved.'); return; }
      if (node.parentId !== targetFolderId) mutations.moveFolderMutation.mutate({ folderId: node.id, parentFolderId: targetFolderId, order: {}, parentChanged: true, orderChanged: false, changed: true });
      return;
    }
    const entry = folderTree.allNotes.find(candidate => candidate.note.id === (action?.type === 'note' ? action.note.id : selectedNote?.id));
    if (!entry) {
      toast.info('Select a note in this workspace first.');
      return;
    }
    handleNoteMove({ note: entry, targetFolderId, changed: getNoteCurrentFolderId(entry) !== targetFolderId });
  }, [folderTree, handleNoteMove, mutations.moveFolderMutation, selectedNote?.id, setSelectedFolderId]);

  const workspaceNavigation = useMemo(() => getWorkspaceNavigationTeams(
    teams,
    settings?.workspaceNavigation?.pinnedTeamIds ?? null,
  ), [settings?.workspaceNavigation?.pinnedTeamIds, teams]);
  const switchWorkspaceAtIndex = useCallback((workspaceIndex: number) => {
    if (workspaceIndex === 0) {
      switchWorkspaceScope({ type: 'personal', label: 'My Workspace' });
      return true;
    }

    const team = workspaceNavigation.pinnedTeams[workspaceIndex - 1];
    if (!team || workspaceIndex > 8) {
      return false;
    }

    switchWorkspaceScope({ type: 'team', label: team.name, teamPath: team.path });
    return true;
  }, [switchWorkspaceScope, workspaceNavigation.pinnedTeams]);

  useWorkbenchShortcuts({
    activeFinderState,
    closeTransientLayer: closeTopOverlay,
    characterShortcutsEnabled: settings?.keyboardNavigation?.characterShortcutsEnabled ?? true,
    handleCreateNote: folderCommands.handleCreateNote,
    noteDirty,
    openPalette,
    openLeaderMenu,
    platform: api?.platform ?? navigator.platform,
    refreshWorkspace,
    runAction: runShortcutAction,
    selectedFolderId,
    setFinderState,
    setSelectedFolderId,
    shortcuts: settings?.shortcuts,
    switchWorkspaceAtIndex,
  });

  const backupNotice = useWorkspaceBackupNotice({ api, workspace: noteWorkspace });
  const { copyDraftText, exportDraftText } = useDraftTextActions(api);
  const readBackgroundTabDocument = useCallback(async (originScopeKey: string, tab: OpenNoteTab) => {
    const identity = getSavedTabNoteIdentity(tab);
    if (!api || !identity) return undefined;
    if (identity.teamPath === LOCAL_VAULT_TEAM_PATH) {
      // Only a note of the scope on screen: any folder of an open set, read from the folder that
      // holds it. A tab left behind in another scope is never read here.
      const owner = snapshotForLocalNote(identity);
      if (!owner || originScopeKey !== currentScopeKeyRef.current) return undefined;
      return toDocumentSummary(await api.localVault.readNote(identity.id), owner);
    }
    const result = await api.hackmd.getNote(identity.id, identity.teamPath);
    return result.source === 'error' ? undefined : result.data;
  }, [api, snapshotForLocalNote]);
  const { attachImageToTab, cancelImageUpload, uploadingTabIds } = useTabImageUploads({
    scopeKey: noteWorkspace.state.scopeKey,
    getTabDocument: workbenchDocuments.getTabDocument,
    getWorkspaceSnapshot: noteWorkspace.getWorkspaceSnapshot,
    replaceTabPlaceholder: noteWorkspace.replaceTabPlaceholder,
    readTabDocument: readBackgroundTabDocument,
    uploadImage: (note, input, signal) => mutations.uploadNoteImageMutation.mutateAsync({ note, input, signal }),
  });
  const retryDocumentLoad = useCallback((tab: OpenNoteTab) => {
    const identity = getSavedTabNoteIdentity(tab);
    if (!identity) return;
    void Promise.resolve(documentQueries.refetchByIdentity(identity)).catch(() => undefined);
  }, [documentQueries]);
  const homeStatus = useElectronHomeStatus({
    isLocalVaultLoading: vaultSession.isLoading,
    isLocalVaultFetching: vaultSession.snapshotQuery.isFetching || vaultSession.isChanging,
    canCreate: usingInitialDrafts || canCreate,
    finderActive,
    hasLocalVault: hasConfiguredLocalVault,
    hasToken: canUseCurrentWorkspace,
    localVaultError: vaultSession.error ?? (localVault.snapshotQuery.error instanceof Error
      ? localVault.snapshotQuery.error.message
      : null),
    localVaultSkippedFiles: vaultSession.snapshot?.skippedFiles,
    mutations,
    queries,
    scope,
    selectedFolder,
  });
  const workspaceProps = useHomeWorkspaceProps({
    api,
    openNoteTarget,
    revealFolder,
    saveAsTemplate: () => noteTemplates.saveDocumentAsTemplate(selectedDocument, { title: documentTitle, content: documentContent }),
    localVaultId: vaultSession.vaultId,
    workspaceFolders,
    uploadingTabIds,
    actions: {
      saveDraftNote,
      togglePaneZoom,
      attachImageToTab,
      cancelImageUpload,
      copyDraftText,
      exportDraftText,
      retryDocumentLoad,
      handleCopyNoteLink,
      handleCopyNoteMarkdownLink,
      handleDeleteRequest,
      handleDuplicateNote,
      handleExportMarkdown,
      handleExportNoteMarkdown,
      handleImportMarkdownNote,
      handleCreateNoteFromTemplate: folderCommands.handleCreateNoteFromTemplate,
      handleHackmdDisconnected,
      handleNoteKeep,
      handleNoteSelect,
      handleOpenEditor,
      handleOpenExternal,
      openHackmdTokenSetup,
      openPalette,
      openQuickOpen,
      setFinderState,
      switchWorkspaceScope,
      openTrashNote: (note) => void requestSelectNote(note, { focusEditor: true }),
      renameNoteInline: (note, name) => {
        if (!api) return;
        void (async () => {
          const owner = snapshotForLocalNote(note);
          if (note.teamPath === LOCAL_VAULT_TEAM_PATH && !owner) throw new Error('The local vault is no longer available.');
          // A rename writes only the title: a HackMD note renames straight from its summary, while
          // a local write needs the file's content and revision, so only that fetches the document.
          const result = note.teamPath === LOCAL_VAULT_TEAM_PATH && owner
            ? toDocumentSummary(await api.localVault.readNote(note.id), owner)
            : note;
          mutations.updateNoteMutation.mutate({ note: result, input: { title: name }, intent: 'metadata' });
        })().catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to rename note.'));
      },
      moveNoteRequest: (note) => { folderPickerAction.current = { type: 'note', note }; overlayControls.set('palette', { mode: 'move-note', open: true, search: '' }); },
      moveFolderRequest: (id) => { folderPickerAction.current = { type: 'folder', id }; overlayControls.set('palette', { mode: 'move-folder', open: true, search: '' }); },
      chooseNewNoteLocation: (folderId) => {
        folderCommands.handleCreateNoteInside(folderId);
      },
    },
    activeFinderState,
    collapsedFolderIds,
    displayScope,
    documents: workbenchDocuments,
    editorRequests,
    consumeEditorRequest,
    editorMode: settings?.editor?.mode ?? defaultSettings.editor.mode,
    folderCommands,
    folderTree,
    getTabSyncState,
    homeStatus,
    inspectorCollapsed,
    localDocumentRecovery,
    remoteDocumentRecovery,
    localVaultActions,
    mutations,
    navigator: workbenchNavigator,
    navigatorCollapsed,
    navigatorWidth,
    noteWorkspace,
    refreshWorkspace,
    selectedFolderId,
    selectedNote,
    setNavigatorWidth,
    settings,
    tabLifecycle: {
      requestCloseOtherTabs,
      requestCloseTab,
      requestCloseTabsToRight,
    },
    teams,
    toggleInspectorCollapsed: toggleNoteDetails,
    toggleNavigatorCollapsed: toggleSidebar,
    user,
    overlays,
    overlayControls,
    onNewTab: () => runShortcutAction('new-tab'),
    recentNotes,
  });
  const overlayProps = useHomeOverlayProps({
    actionContext,
    api,
    commandPaletteProps: {
      ...commandPaletteProps,
      onStateChange: (next) => {
        if (!next.open && folderPickerAction.current?.type === 'create') {
          const { title } = folderPickerAction.current;
          folderPickerAction.current = null;
          overlayControls.set('createNote', { open: true, title });
        }
        overlayControls.set('palette', next);
      },
    },
    commandPaletteTheme: {
      themeMode: theme,
      themePresetId: presetId,
      themePresets: presets,
      onSelectThemeMode: setTheme,
      onSelectThemePreset: setPresetId,
    },
    commandPaletteUtilities: {
      hasHackmdApiToken: settings?.hasHackmdApiToken === true,
      onConnectHackmd: openHackmdTokenSetup,
      onMoveNoteToFolder: moveSelectedNoteToFolder,
      onOpenSettingsTab: openSettingsTab,
    },
    overlays,
    overlayControls,
    displayScope,
    localVaultActions,
    localVaultError: vaultSession.error ?? (localVault.snapshotQuery.error instanceof Error
      ? localVault.snapshotQuery.error.message
      : null),
    localVaultSnapshot: localVault.snapshot,
    mutations,
    onHackmdDisconnected: handleHackmdDisconnected,
    onChooseNoteLocation: () => {
      folderPickerAction.current = { type: 'create', title: overlays.createNote.title };
      overlayControls.set('createNote', { ...overlays.createNote, open: false });
      overlayControls.set('palette', { mode: 'choose-note-folder', open: true, search: '' });
    },
    runAction: runPaletteAction,
    selectedFolderLabel,
    onOnboardingConnected: handleOnboardingConnected,
    settings,
    user,
  });

  const leaderLevel = overlays.leaderPath && getLeaderLevel(overlays.leaderPath, {
    actionContext,
    shortcuts: settings?.shortcuts,
    platform: api?.platform ?? navigator.platform,
    characterShortcutsEnabled: settings?.keyboardNavigation?.characterShortcutsEnabled ?? true,
  });
  const shortcutContext = useMemo(() => ({ shortcuts: settings?.shortcuts, platform: api?.platform ?? navigator.platform, characterShortcutsEnabled: settings?.keyboardNavigation?.characterShortcutsEnabled ?? true }), [settings?.shortcuts, settings?.keyboardNavigation?.characterShortcutsEnabled, api?.platform]);

  const chooseDraftDestination = async (destination: 'local' | 'hackmd') => {
    overlayControls.set('destination', false);
    try {
      if (destination === 'hackmd') {
        if (hasToken) setWorkspaceScope(DEFAULT_WORKSPACE_SCOPE);
        else overlayControls.set('onboarding', true);
      } else if (settings?.hasLocalVault && vaultSession.vaultId && !vaultSession.isChanging) {
        const activePath = getActiveLocalVaultPath(settings);
        setWorkspaceScope({ type: 'local', label: activePath ? localVaultFolderName(activePath) : 'Local Vault', vaultId: vaultSession.vaultId });
      } else if (!await localVaultActions.chooseLocalVault()) {
        pendingInitialSave.current = null;
        requestEditorFocus();
      }
    } catch (error) {
      pendingInitialSave.current = null;
      toast.error(error instanceof Error ? error.message : 'Failed to move drafts.');
      requestEditorFocus();
    }
  };

  if (!api) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background-muted text-sm text-text-subtle">
        Electron API is unavailable.
      </div>
    );
  }

  return (
    <DialogReturnFocusProvider value={getDialogReturnFocus}>
    <ActionShortcutContext.Provider value={shortcutContext}>
      <KeyboardNavigation workspaceKey={scopeStorageKey} shortcuts={settings?.shortcuts} platform={api.platform} characterEnabled={settings?.keyboardNavigation?.characterShortcutsEnabled ?? true}>
        <div data-hack-mode={hackMode || undefined} className="app-chrome flex h-dvh flex-col overflow-hidden bg-background-muted text-text-default">
          <BookSessionContext.Provider value={bookSession}>
            <TeamNameLookupContext.Provider value={lookupTeamName}>
            <LocalVaultNameContext.Provider value={(() => {
              const activePath = settings ? getActiveLocalVaultPath(settings) : null;
              return activePath ? localVaultFolderName(activePath) : null;
            })()}>
            <NoteSummaryLookupContext.Provider value={lookupNoteSummary}>
              <ElectronHomeWorkspace {...workspaceProps} backupNotice={backupNotice} />
            </NoteSummaryLookupContext.Provider>
            </LocalVaultNameContext.Provider>
            </TeamNameLookupContext.Provider>
          </BookSessionContext.Provider>
          {leaderLevel ? (
            <LeaderMenu
              level={leaderLevel}
              onPathChange={(path) => overlayControls.set('leaderPath', path)}
              onClose={() => overlayControls.set('leaderPath', null)}
              onRun={id => runPaletteAction(id)}
            />
          ) : null}
          {/* Appearance → Status line hides it outright; otherwise it shows while there's anything to say. */}
          {statusLineVisible && ((settings?.keyboardNavigation?.keyHintsVisible ?? true) || splitStatusLine) ? (
            <KeyHintBar
              actionContext={actionContext}
              leader={leaderLevel}
              shortcuts={settings?.shortcuts}
              platform={api.platform}
              characterShortcutsEnabled={settings?.keyboardNavigation?.characterShortcutsEnabled ?? true}
              onOpenShortcuts={openKeyboardShortcuts}
              splitStatusLine={splitStatusLine}
              sidebarPanelId={NOTE_NAVIGATOR_PANEL_ID}
              navigatorCollapsed={navigatorCollapsed}
              keyHintsVisible={settings?.keyboardNavigation?.keyHintsVisible ?? true}
            />
          ) : null}

          <DraftDestinationDialog
            open={overlays.destination}
            onCloseComplete={() => { if (!pendingInitialSave.current) requestEditorFocus(); }}
            onOpenChange={open => {
              overlayControls.set('destination', open);
              if (!open) { pendingInitialSave.current = null; requestEditorFocus(); }
            }}
            onChoose={destination => { void chooseDraftDestination(destination); }}
          />
          <ElectronHomeOverlays {...overlayProps} dialogs={{
            ...overlayProps.dialogs,
            settingsInitialTab: overlays.settings.tab,
            onSettingsOpenChange: (open) => (open ? overlayControls.openSettings() : overlayControls.close('settings')),
            onOnboardingOpenChange: open => {
              overlayControls.set('onboarding', open);
              const configured = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
              if (!open && !configured?.hasHackmdApiToken && !configured?.hasLocalVault) {
                pendingInitialSave.current = null;
                requestEditorFocus();
              }
            },
          }} />
          <TemplatePickerDialog
            open={noteTemplates.pickerOpen}
            onOpenChange={noteTemplates.setPickerOpen}
            templates={noteTemplates.templates}
            onChoose={noteTemplates.chooseTemplate}
          />
          <AskNotesDialog askNotes={askNotes} onOpenNote={note => openNoteTarget(toRecentNote(note))} />
          {folderPicker.dialog}
          <ConfirmDialogHost />
          {shortcutHelp ? <KeyboardShortcutsDialog
            open region={shortcutHelp.region} returnFocus={shortcutHelp.target}
            shortcuts={settings?.shortcuts} platform={api.platform}
            characterShortcutsEnabled={settings?.keyboardNavigation?.characterShortcutsEnabled ?? true}
            onOpenChange={open => { if (!open) { overlayControls.set('shortcutHelp', null); focusZone(shortcutHelp.region); } }}
            onCustomize={() => { overlayControls.set('shortcutHelp', null); overlayControls.openSettings('shortcuts'); }}
          /> : null}
        </div>
      </KeyboardNavigation>
    </ActionShortcutContext.Provider>
    </DialogReturnFocusProvider>
  );
}
