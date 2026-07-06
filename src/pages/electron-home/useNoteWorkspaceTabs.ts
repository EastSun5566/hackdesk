import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { NoteSummary } from '@/lib/electron-api';

import {
  clearNoteTabDraft,
  closeNoteTab,
  closeOtherNoteTabs,
  closeTabsToRight,
  closeTabsByNoteIdentity,
  createEmptyNoteWorkspaceState,
  duplicateActiveNoteTab,
  focusAdjacentPane,
  focusAdjacentTab,
  focusNotePane,
  getActiveTab,
  getPaneActiveTab,
  getTabPane,
  getVisibleActiveTabs,
  moveActiveTabToOtherPane,
  navigateNoteWorkspace,
  noteIdentityMatches,
  openNoteTab,
  readNoteWorkspaceLayoutStorage,
  reopenLastClosedTab,
  resizeNotePanes,
  selectNoteTab,
  splitActiveTabRight,
  syncNoteTabSummary,
  updateNoteTabDraft,
  writeNoteWorkspaceLayoutStorage,
  type NoteDocumentDraft,
  type NoteIdentity,
  type NoteWorkspaceState,
} from './note-workspace';

function readInitialState(scopeKey: string) {
  return typeof window === 'undefined'
    ? createEmptyNoteWorkspaceState(scopeKey)
    : readNoteWorkspaceLayoutStorage(window.localStorage, scopeKey);
}

export function useNoteWorkspaceTabs(scopeKey: string) {
  const [state, setState] = useState<NoteWorkspaceState>(() => readInitialState(scopeKey));
  const stateRef = useRef(state);
  const scopeKeyRef = useRef(scopeKey);
  const statesByScopeRef = useRef<Record<string, NoteWorkspaceState>>({});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    statesByScopeRef.current[scopeKeyRef.current] = stateRef.current;
    setState(statesByScopeRef.current[scopeKey] ?? readInitialState(scopeKey));
    scopeKeyRef.current = scopeKey;
  }, [scopeKey]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      writeNoteWorkspaceLayoutStorage(window.localStorage, state);
    }
  }, [state]);

  const activeTab = useMemo(() => getActiveTab(state), [state]);
  const visibleActiveTabs = useMemo(() => getVisibleActiveTabs(state), [state]);

  const openNote = useCallback((note: NoteSummary, paneId?: string) => {
    setState((current) => openNoteTab(current, note, paneId));
  }, []);

  const selectTab = useCallback((paneId: string, tabId: string) => {
    setState((current) => selectNoteTab(current, paneId, tabId));
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
    setState((current) => closeTabsByNoteIdentity(current, note));
  }, []);

  const reopenLastClosed = useCallback(() => {
    setState(reopenLastClosedTab);
  }, []);

  const duplicateActiveTab = useCallback(() => {
    setState(duplicateActiveNoteTab);
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

  const resizePanes = useCallback((sizes: Record<string, number>) => {
    setState((current) => resizeNotePanes(current, sizes));
  }, []);

  const syncNoteSummary = useCallback((note: NoteSummary) => {
    setState((current) => syncNoteTabSummary(current, note));
  }, []);

  const syncNoteSummaries = useCallback((notes: NoteSummary[]) => {
    setState((current) => notes.reduce((nextState, note) => syncNoteTabSummary(nextState, note), current));
  }, []);

  const getPaneTab = useCallback((paneId: string) => getPaneActiveTab(state, paneId), [state]);
  const getTabHostPane = useCallback((tabId: string) => getTabPane(state, tabId), [state]);

  const getTabsMatching = useCallback((note: NoteIdentity) => (
    Object.values(state.tabs).filter((tab) => noteIdentityMatches(
      { id: tab.noteId, teamPath: tab.teamPath },
      note,
    ))
  ), [state.tabs]);

  return {
    state,
    activeTab,
    visibleActiveTabs,
    openNote,
    focusPane,
    selectTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight: closeTabsRight,
    closeByNoteIdentity,
    reopenLastClosed,
    duplicateActiveTab,
    splitActiveTab,
    moveActiveTabToOtherPane: moveActiveTabToOtherPaneAction,
    navigateBack,
    navigateForward,
    focusNextPane,
    focusPreviousPane,
    focusNextTab,
    focusPreviousTab,
    updateDraft,
    clearDraft,
    resizePanes,
    syncNoteSummary,
    syncNoteSummaries,
    getPaneTab,
    getTabHostPane,
    getTabsMatching,
  };
}
