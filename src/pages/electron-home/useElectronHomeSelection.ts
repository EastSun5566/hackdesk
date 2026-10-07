import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { NoteSummary } from '@/lib/electron-api';

import { getSavedTabNoteIdentity, type NoteIdentity, type OpenNoteTab } from './note-workspace';

export type ElectronHomeSelectNoteOptions = {
  focusEditor?: boolean;
  trackRecent?: boolean;
};

export type ElectronHomeSelectionOptions = {
  scopeStorageKey?: string | null;
  activePaneId: string;
  getNotePaneId?: (note: NoteSummary) => string | undefined;
  activeTab: OpenNoteTab | null;
  requestEditorFocus: () => void;
  openNoteInWorkspace: (note: NoteSummary) => void;
  selectionRefs: ElectronHomeSelectionRefs;
  trackRecentNote: (note: NoteSummary) => void;
};

export type ElectronHomeSelectionRefs = {
  autoSelectSuppressionRef: MutableRefObject<string | null>;
  manualEmptyWorkspaceRef: MutableRefObject<boolean>;
};

export function useElectronHomeSelectionRefs(): ElectronHomeSelectionRefs {
  const autoSelectSuppressionRef = useRef<string | null>(null);
  const manualEmptyWorkspaceRef = useRef(false);

  return useMemo(() => ({
    autoSelectSuppressionRef,
    manualEmptyWorkspaceRef,
  }), []);
}

export function useElectronHomeSelection({
  activeTab,
  activePaneId,
  getNotePaneId,
  requestEditorFocus,
  scopeStorageKey,
  openNoteInWorkspace,
  selectionRefs,
  trackRecentNote,
}: ElectronHomeSelectionOptions) {
  const pendingFocusRef = useRef<{
    scopeKey: string | null | undefined; paneId: string; note: NoteIdentity;
  } | null>(null);
  const [selectionRequestId, setSelectionRequestId] = useState(0);
  const { autoSelectSuppressionRef, manualEmptyWorkspaceRef } = selectionRefs;

  useEffect(() => {
    autoSelectSuppressionRef.current = null;
  }, [scopeStorageKey, autoSelectSuppressionRef]);

  const selectedNote = useMemo<NoteIdentity | null>(() => (
    getSavedTabNoteIdentity(activeTab)
  ), [activeTab]);

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (!pendingFocus) return;
    pendingFocusRef.current = null;
    if (pendingFocus.scopeKey === scopeStorageKey && pendingFocus.paneId === activePaneId
      && selectedNote?.id === pendingFocus.note.id && selectedNote.teamPath === pendingFocus.note.teamPath) {
      requestEditorFocus();
    }
  }, [activePaneId, requestEditorFocus, scopeStorageKey, selectedNote, selectionRequestId]);

  const requestSelectNote = useCallback(async (
    note: NoteSummary,
    options: ElectronHomeSelectNoteOptions = {},
  ) => {
    autoSelectSuppressionRef.current = null;
    manualEmptyWorkspaceRef.current = false;
    openNoteInWorkspace(note);
    if (options.trackRecent ?? true) {
      trackRecentNote(note);
    }

    if (options.focusEditor) {
      pendingFocusRef.current = { scopeKey: scopeStorageKey, paneId: getNotePaneId?.(note) ?? activePaneId, note: { id: note.id, teamPath: note.teamPath } };
      setSelectionRequestId(id => id + 1);
    }

    return true;
  }, [activePaneId, getNotePaneId, autoSelectSuppressionRef, manualEmptyWorkspaceRef, openNoteInWorkspace, scopeStorageKey, trackRecentNote]);

  const handleNoteSelect = useCallback((note: NoteSummary) => {
    void requestSelectNote(note, { focusEditor: true, trackRecent: true });
  }, [requestSelectNote]);

  return {
    autoSelectSuppressionRef,
    handleNoteSelect,
    manualEmptyWorkspaceRef,
    requestSelectNote,
    selectedNote,
  };
}
