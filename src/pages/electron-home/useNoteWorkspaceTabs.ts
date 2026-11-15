import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { NoteSummary } from '@/lib/electron-api';

import type { PaneDirection } from './pane-layout';

import {
  clearNoteTabDraft,
  closeNoteTab,
  closeOtherNoteTabs,
  closeTabsToRight,
  closeTabsByNoteIdentity,
  createEmptyNoteWorkspaceState,
  duplicateActiveNoteTab,
  openBlankNoteTab,
  focusAdjacentPane,
  focusAdjacentTab,
  focusNotePane,
  getActiveTab,
  getPaneActiveTab,
  getTabPane,
  getVisibleActiveTabs,
  materializeDraftNoteTab,
  moveActiveTabToOtherPane,
  navigateNoteWorkspace,
  noteIdentityMatches,
  openDraftNoteTab,
  getTabByNoteIdentity,
  keepNoteTab,
  openNoteInPlace,
  openNotePreview,
  openNoteTab,
  readNoteWorkspaceLayoutStorage,
  reopenLastClosedTab,
  reorderNoteTab,
  resizeNoteSplit,
  equalizeNotePanes,
  focusPaneInDirection,
  toggleNotePaneZoom,
  splitActivePane,
  reconcileSavedNoteTab,
  replaceNoteTabPlaceholder,
  selectNoteTab,
  splitActiveTabRight,
  syncNoteTabSummary,
  updateNoteTabDraft,
  writeNoteWorkspaceLayoutStorage,
  hasNoteWorkspaceLayoutStorage,
  type NoteDocumentDraft,
  type NoteIdentity,
  type NoteWorkspaceState,
  type OpenDraftNoteOptions,
  type SavedNoteDocument,
} from './note-workspace';
import { INITIAL_DRAFT_SCOPE_KEY, mergeInitialDrafts } from './initial-draft-workspace';

function readInitialState(scopeKey: string | null, initializeDraft = false) {
  const state = !scopeKey || typeof window === 'undefined'
    ? createEmptyNoteWorkspaceState(scopeKey ?? '')
    : readNoteWorkspaceLayoutStorage(window.localStorage, scopeKey);
  return scopeKey && initializeDraft && typeof window !== 'undefined' && !hasNoteWorkspaceLayoutStorage(window.localStorage, scopeKey)
    ? openDraftNoteTab(state) : state;
}

export function useNoteWorkspaceTabs(scopeKey: string | null, initializeDraft = false) {
  const [state, setState] = useState<NoteWorkspaceState>(() => readInitialState(scopeKey, initializeDraft));
  const stateRef = useRef(state);
  const [statesByScope, setStatesByScope] = useState<Record<string, NoteWorkspaceState>>({});
  // Scopes whose latest in-memory state could not be written. Their drafts stay
  // in memory only, so the UI must not claim they are backed up.
  const [backupFailedScopes, setBackupFailedScopes] = useState<ReadonlySet<string>>(() => new Set());
  const persist = useCallback((next: NoteWorkspaceState, { reportFailure = true } = {}) => {
    if (!next.scopeKey || typeof window === 'undefined') return true;
    const saved = writeNoteWorkspaceLayoutStorage(window.localStorage, next);
    if (!saved && !reportFailure) return false;
    setBackupFailedScopes((current) => {
      if (saved !== current.has(next.scopeKey)) return current;
      const updated = new Set(current);
      if (saved) updated.delete(next.scopeKey);
      else updated.add(next.scopeKey);
      return updated;
    });
    return saved;
  }, []);
  const flush = useCallback(() => persist(stateRef.current), [persist]);

  // Update this hook's state before children commit, without mutating refs during render.
  if (state.scopeKey !== (scopeKey ?? '')) {
    if (state.scopeKey) setStatesByScope({ ...statesByScope, [state.scopeKey]: state });
    setState((scopeKey && statesByScope[scopeKey]) || readInitialState(scopeKey, initializeDraft));
  }
  // Scope cleanup runs before the next committed state replaces this ref.
  useLayoutEffect(() => () => { flush(); }, [scopeKey, flush]);
  useLayoutEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (!scopeKey || typeof window === 'undefined') return;
    const timeout = window.setTimeout(flush, 250);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('pagehide', flush);
    };
  }, [state, scopeKey, flush]);

  // Pending operations can finish while another workspace is visible. Persist
  // those results too, so returning or restarting sees the completed operation.
  useEffect(() => {
    for (const [key, savedState] of Object.entries(statesByScope)) {
      if (key !== scopeKey) persist(savedState);
    }
  }, [statesByScope, scopeKey, persist]);

  const retryBackup = useCallback(() => {
    let saved = flush();
    for (const key of backupFailedScopes) {
      const savedState = key === stateRef.current.scopeKey ? undefined : statesByScope[key];
      if (savedState) saved = persist(savedState) && saved;
    }
    return saved;
  }, [backupFailedScopes, flush, persist, statesByScope]);

  const statesByScopeRef = useRef(statesByScope);
  useLayoutEffect(() => { statesByScopeRef.current = statesByScope; }, [statesByScope]);
  // Latest committed state of any workspace, for work that finishes after switching.
  const getWorkspaceSnapshot = useCallback((key: string) => (
    stateRef.current.scopeKey === key ? stateRef.current : statesByScopeRef.current[key] ?? null
  ), []);

  const transferInitialDrafts = useCallback((targetKey: string, selectedTabId?: string | null) => {
    const source = stateRef.current;
    if (source.scopeKey !== INITIAL_DRAFT_SCOPE_KEY) return;
    const target = getWorkspaceSnapshot(targetKey) ?? readInitialState(targetKey);
    const next = mergeInitialDrafts(source, target, selectedTabId);
    const empty = createEmptyNoteWorkspaceState(INITIAL_DRAFT_SCOPE_KEY);
    // Preserve the last input before copying; never clear the source before the target is backed up.
    if (!persist(source) || !persist(next) || !persist(empty)) {
      throw new Error('HackDesk could not back up these drafts. Your text is still here.');
    }
    stateRef.current = empty;
    setState(empty);
    setStatesByScope(current => ({ ...current, [targetKey]: next }));
  }, [getWorkspaceSnapshot, persist]);

  const updateWorkspace = useCallback((key: string | null, update: (current: NoteWorkspaceState) => NoteWorkspaceState) => {
    if (!key) return;
    if (stateRef.current.scopeKey === key) {
      setState(update);
    } else {
      setStatesByScope((current) => ({ ...current, [key]: update(current[key] ?? readInitialState(key)) }));
    }
  }, []);

  const activeTab = useMemo(() => getActiveTab(state), [state]);
  const visibleActiveTabs = useMemo(() => getVisibleActiveTabs(state), [state]);

  const openNote = useCallback((note: NoteSummary, paneId?: string) => {
    updateWorkspace(scopeKey, (current) => openNoteTab(current, note, paneId));
  }, [scopeKey, updateWorkspace]);

  /** Opens a note from the sidebar in the pane's preview tab (see openNotePreview). */
  const openNoteAsPreview = useCallback((note: NoteSummary, paneId?: string) => {
    updateWorkspace(scopeKey, (current) => openNotePreview(current, note, paneId));
  }, [scopeKey, updateWorkspace]);

  /** Keeps a preview tab open, as double-clicking it does. */
  const keepTab = useCallback((tabId: string) => {
    updateWorkspace(scopeKey, (current) => keepNoteTab(current, tabId));
  }, [scopeKey, updateWorkspace]);

  /** Keeps the tab showing a note, as double-clicking the note in the sidebar does. */
  const keepNote = useCallback((note: NoteIdentity) => {
    updateWorkspace(scopeKey, (current) => {
      const tab = getTabByNoteIdentity(current, note);
      return tab ? keepNoteTab(current, tab.tabId) : current;
    });
  }, [scopeKey, updateWorkspace]);

  /**
   * Shows the note in an open tab rather than a new one, as a book's tab turns chapters: the tab
   * named, or the active one.
   */
  const showNoteInActiveTab = useCallback((note: NoteSummary, tabId?: string) => {
    updateWorkspace(scopeKey, (current) => openNoteInPlace(current, note, undefined, tabId));
  }, [scopeKey, updateWorkspace]);

  const openDraftNote = useCallback((options?: string | OpenDraftNoteOptions) => {
    if (!stateRef.current.scopeKey) return;
    setState((current) => openDraftNoteTab(current, options));
  }, []);

  const openRecoverableDraftNote = useCallback((options: OpenDraftNoteOptions) => {
    if (!stateRef.current.scopeKey) throw new Error('Local Vault is still loading. Your text is still here.');
    const next = openDraftNoteTab(stateRef.current, options);
    // Quick Hack text is accepted only after it is backed up. On failure the
    // popup keeps it and the workspace, including its existing backup, is unchanged.
    if (!persist(next, { reportFailure: false })) throw new Error('HackDesk could not back up this capture. Your text is still here.');
    stateRef.current = next;
    setState(next);
  }, [persist]);

  const materializeDraftNote = useCallback((tabId: string, note: NoteSummary, submittedDraft?: NoteDocumentDraft) => {
    updateWorkspace(scopeKey, (current) => materializeDraftNoteTab(current, tabId, note, submittedDraft));
  }, [scopeKey, updateWorkspace]);

  const selectTab = useCallback((paneId: string, tabId: string) => {
    setState((current) => selectNoteTab(current, paneId, tabId));
  }, []);

  const reorderTab = useCallback((paneId: string, tabId: string, overTabId: string) => {
    setState((current) => reorderNoteTab(current, paneId, tabId, overTabId));
  }, []);

  const focusPane = useCallback((paneId: string) => {
    setState((current) => focusNotePane(current, paneId));
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setState((current) => closeNoteTab(current, tabId));
  }, []);

  const closeOtherTabs = useCallback((paneId: string, keepTabId: string) => {
    setState((current) => closeOtherNoteTabs(current, paneId, keepTabId));
  }, []);

  const closeTabsRight = useCallback((paneId: string, tabId: string) => {
    setState((current) => closeTabsToRight(current, paneId, tabId));
  }, []);

  const closeByNoteIdentity = useCallback((note: NoteIdentity) => {
    updateWorkspace(scopeKey, (current) => closeTabsByNoteIdentity(current, note));
  }, [scopeKey, updateWorkspace]);

  const reopenLastClosed = useCallback(() => {
    setState(reopenLastClosedTab);
  }, []);

  const duplicateActiveTab = useCallback(() => {
    setState(duplicateActiveNoteTab);
  }, []);

  const openBlankTab = useCallback(() => {
    setState(openBlankNoteTab);
  }, []);

  const splitActivePaneDown = useCallback(() => {
    setState((current) => splitActivePane(current, 'down'));
  }, []);

  const focusPaneToward = useCallback((direction: PaneDirection) => {
    setState((current) => focusPaneInDirection(current, direction));
  }, []);

  const togglePaneZoom = useCallback(() => {
    setState(toggleNotePaneZoom);
  }, []);

  const equalizePanes = useCallback(() => {
    setState(equalizeNotePanes);
  }, []);

  const splitActiveTab = useCallback(() => {
    setState(splitActiveTabRight);
  }, []);

  const moveActiveTabToOtherPaneAction = useCallback(() => {
    setState(moveActiveTabToOtherPane);
  }, []);

  const navigateBack = useCallback(() => {
    setState((current) => navigateNoteWorkspace(current, 'back'));
  }, []);

  const navigateForward = useCallback(() => {
    setState((current) => navigateNoteWorkspace(current, 'forward'));
  }, []);

  const focusNextPane = useCallback(() => {
    setState((current) => focusAdjacentPane(current, 'next'));
  }, []);

  const focusPreviousPane = useCallback(() => {
    setState((current) => focusAdjacentPane(current, 'previous'));
  }, []);

  const focusNextTab = useCallback(() => {
    setState((current) => focusAdjacentTab(current, 'next'));
  }, []);

  const focusPreviousTab = useCallback(() => {
    setState((current) => focusAdjacentTab(current, 'previous'));
  }, []);

  const updateDraft = useCallback((tabId: string, draft: NoteDocumentDraft) => {
    setState((current) => updateNoteTabDraft(current, tabId, draft));
  }, []);

  const clearDraft = useCallback((tabId: string) => {
    setState((current) => clearNoteTabDraft(current, tabId));
  }, []);

  const resizeSplit = useCallback((splitId: string, sizes: Record<string, number>) => {
    setState((current) => resizeNoteSplit(current, splitId, sizes));
  }, []);

  const syncNoteSummary = useCallback((note: NoteSummary) => {
    updateWorkspace(scopeKey, (current) => syncNoteTabSummary(current, note));
  }, [scopeKey, updateWorkspace]);

  const syncNoteSummaries = useCallback((notes: NoteSummary[]) => {
    setState((current) => notes.reduce((nextState, note) => syncNoteTabSummary(nextState, note), current));
  }, []);

  const reconcileSavedNote = useCallback((input: Parameters<typeof reconcileSavedNoteTab>[1]) => {
    updateWorkspace(scopeKey, (current) => reconcileSavedNoteTab(current, input));
  }, [scopeKey, updateWorkspace]);

  const replaceTabPlaceholder = useCallback((
    key: string,
    tabId: string,
    placeholder: string,
    replacement: string,
    savedDocument?: SavedNoteDocument,
  ) => {
    updateWorkspace(key, (current) => replaceNoteTabPlaceholder(current, tabId, placeholder, replacement, savedDocument));
  }, [updateWorkspace]);

  const getPaneTab = useCallback((paneId: string) => getPaneActiveTab(state, paneId), [state]);
  const getTabHostPane = useCallback((tabId: string) => getTabPane(state, tabId), [state]);

  const getTabsMatching = useCallback((note: NoteIdentity) => (
    Object.values(state.tabs).filter((tab) => noteIdentityMatches(
      'noteId' in tab ? { id: tab.noteId, teamPath: tab.teamPath } : null,
      note,
    ))
  ), [state.tabs]);

  return {
    state,
    flush,
    backupFailed: backupFailedScopes.size > 0,
    backupFailedInCurrentWorkspace: backupFailedScopes.has(state.scopeKey),
    backupFailedInOtherWorkspace: [...backupFailedScopes].some((key) => key !== state.scopeKey),
    retryBackup,
    activeTab,
    visibleActiveTabs,
    openNote,
    openNoteAsPreview,
    keepTab,
    keepNote,
    showNoteInActiveTab,
    openDraftNote,
    openRecoverableDraftNote,
    materializeDraftNote,
    focusPane,
    selectTab,
    reorderTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight: closeTabsRight,
    closeByNoteIdentity,
    reopenLastClosed,
    duplicateActiveTab,
    openBlankTab,
    splitActiveTab,
    splitActivePaneDown,
    focusPaneToward,
    togglePaneZoom,
    equalizePanes,
    moveActiveTabToOtherPane: moveActiveTabToOtherPaneAction,
    navigateBack,
    navigateForward,
    focusNextPane,
    focusPreviousPane,
    focusNextTab,
    focusPreviousTab,
    updateDraft,
    clearDraft,
    resizeSplit,
    syncNoteSummary,
    syncNoteSummaries,
    reconcileSavedNote,
    getWorkspaceSnapshot,
    transferInitialDrafts,
    replaceTabPlaceholder,
    getPaneTab,
    getTabHostPane,
    getTabsMatching,
  };
}
