import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { NoteSummary } from '@/lib/electron-api';

import { getSavedTabNoteIdentity, type NoteIdentity, type OpenNoteTab } from './note-workspace';
import { readFocusEditorOnOpen } from './note-focus-preference';
import type { InPlaceTarget } from './useNoteLinkOpener';

export type ElectronHomeSelectNoteOptions = {
  focusEditor?: boolean;
  trackRecent?: boolean;
  /** Show it in an open tab instead of a new one, as a book's tab turns chapters. */
  inPlace?: InPlaceTarget;
  /** Open it in the pane's preview tab, which the next sidebar pick replaces. */
  preview?: boolean;
};

export type ElectronHomeSelectionOptions = {
  scopeStorageKey?: string | null;
  activePaneId: string;
  getNotePaneId?: (note: NoteSummary) => string | undefined;
  activeTab: OpenNoteTab | null;
  requestEditorFocus: () => void;
  openNoteInWorkspace: (note: NoteSummary, options?: { inPlace?: InPlaceTarget; preview?: boolean }) => void;
  /** Keeps the tab showing a note, so the next sidebar pick does not replace it. */
  keepNoteInWorkspace?: (note: NoteIdentity) => void;
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
  keepNoteInWorkspace,
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
    openNoteInWorkspace(note, { inPlace: options.inPlace, preview: options.preview });
    if (options.trackRecent ?? true) {
      trackRecentNote(note);
    }

    pendingFocusRef.current = null;
    if (options.focusEditor) {
      pendingFocusRef.current = { scopeKey: scopeStorageKey, paneId: getNotePaneId?.(note) ?? activePaneId, note: { id: note.id, teamPath: note.teamPath } };
      setSelectionRequestId(id => id + 1);
    }

    return true;
  }, [activePaneId, getNotePaneId, autoSelectSuppressionRef, manualEmptyWorkspaceRef, openNoteInWorkspace, scopeStorageKey, trackRecentNote]);

  // A click in the sidebar previews the note; a double-click keeps its tab.
  const handleNoteSelect = useCallback((note: NoteSummary) => {
    const alreadySelected = selectedNote?.id === note.id && selectedNote.teamPath === note.teamPath;
    void requestSelectNote(note, { focusEditor: readFocusEditorOnOpen(), trackRecent: true, preview: !alreadySelected })
      .then(() => { if (alreadySelected) keepNoteInWorkspace?.(note); });
  }, [keepNoteInWorkspace, requestSelectNote, selectedNote]);

  const handleNoteKeep = useCallback((note: NoteSummary) => {
    void requestSelectNote(note, { focusEditor: readFocusEditorOnOpen(), trackRecent: true }).then(() => keepNoteInWorkspace?.(note));
  }, [keepNoteInWorkspace, requestSelectNote]);

  return {
    autoSelectSuppressionRef,
    handleNoteKeep,
    handleNoteSelect,
    manualEmptyWorkspaceRef,
    requestSelectNote,
    selectedNote,
  };
}
