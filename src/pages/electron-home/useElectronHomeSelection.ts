import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';

import type { NoteSummary } from '@/lib/electron-api';

import { getSavedTabNoteIdentity, type NoteIdentity, type OpenNoteTab } from './note-workspace';
import { readFocusEditorOnOpen } from './note-focus-preference';
import type { InPlaceTarget } from './useNoteLinkOpener';
import type { EditorFocusDestination } from './useWorkbenchEditorRequests';

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
  /** The pane holding a tab, for opens in place, which show the note in that tab. */
  getTabPaneId?: (tabId: string) => string | undefined;
  activeTab: OpenNoteTab | null;
  /** Focuses the picked note's editor once its tab is the active one (useWorkbenchEditorRequests). */
  requestEditorFocusOn: (destination: EditorFocusDestination) => void;
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
  getTabPaneId,
  requestEditorFocusOn,
  scopeStorageKey,
  openNoteInWorkspace,
  keepNoteInWorkspace,
  selectionRefs,
  trackRecentNote,
}: ElectronHomeSelectionOptions) {
  const { autoSelectSuppressionRef, manualEmptyWorkspaceRef } = selectionRefs;

  useEffect(() => {
    autoSelectSuppressionRef.current = null;
  }, [scopeStorageKey, autoSelectSuppressionRef]);

  const selectedNote = useMemo<NoteIdentity | null>(() => (
    getSavedTabNoteIdentity(activeTab)
  ), [activeTab]);

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

    // The editor takes focus once the note's tab is active, in the pane that shows it: the in-place
    // target's pane for an open in place (a book turning to a chapter), else, as for any open (also
    // when that tab closed meanwhile), the pane already holding the note's tab, else the active one.
    if (options.focusEditor && scopeStorageKey) {
      const inPlace = options.inPlace;
      const paneId = typeof inPlace === 'object' ? getTabPaneId?.(inPlace.tabId) ?? getNotePaneId?.(note)
        : inPlace ? activePaneId
          : getNotePaneId?.(note);
      requestEditorFocusOn({ scopeKey: scopeStorageKey, paneId: paneId ?? activePaneId, documentId: note.id });
    }

    return true;
  }, [activePaneId, getNotePaneId, getTabPaneId, autoSelectSuppressionRef, manualEmptyWorkspaceRef, openNoteInWorkspace, requestEditorFocusOn, scopeStorageKey, trackRecentNote]);

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
