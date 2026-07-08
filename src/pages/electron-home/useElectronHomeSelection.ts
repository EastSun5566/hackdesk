import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { DocumentSummary, NoteSummary } from '@/lib/electron-api';

import { getSavedTabNoteIdentity, type NoteIdentity, type OpenNoteTab } from './note-workspace';

export type ElectronHomeSelectNoteOptions = {
  focusEditor?: boolean;
  trackRecent?: boolean;
};

export type ElectronHomeSelectionOptions = {
  activeTab: OpenNoteTab | null;
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
  openNoteInWorkspace,
  selectionRefs,
  trackRecentNote,
}: ElectronHomeSelectionOptions) {
  const pendingEditorFocusNoteIdRef = useRef<string | null>(null);
  const [editorFocusRequestId, setEditorFocusRequestId] = useState(0);
  const { autoSelectSuppressionRef, manualEmptyWorkspaceRef } = selectionRefs;

  const selectedNote = useMemo<NoteIdentity | null>(() => (
    getSavedTabNoteIdentity(activeTab)
  ), [activeTab]);

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
      pendingEditorFocusNoteIdRef.current = note.id;
      setEditorFocusRequestId((requestId) => requestId + 1);
    }

    return true;
  }, [autoSelectSuppressionRef, manualEmptyWorkspaceRef, openNoteInWorkspace, trackRecentNote]);

  const handleNoteSelect = useCallback((note: NoteSummary) => {
    void requestSelectNote(note, { focusEditor: true, trackRecent: true });
  }, [requestSelectNote]);

  const handleSelectedDocumentReady = useCallback((selectedDocument: DocumentSummary | undefined) => {
    if (!selectedDocument || pendingEditorFocusNoteIdRef.current !== selectedDocument.id) {
      return;
    }

    pendingEditorFocusNoteIdRef.current = null;
    setEditorFocusRequestId((requestId) => requestId + 1);
  }, []);

  return {
    autoSelectSuppressionRef,
    editorFocusRequestId,
    handleNoteSelect,
    handleSelectedDocumentReady,
    manualEmptyWorkspaceRef,
    requestSelectNote,
    selectedNote,
  };
}

export function useSelectedDocumentEditorFocus(
  selectedDocument: DocumentSummary | undefined,
  handleSelectedDocumentReady: (selectedDocument: DocumentSummary | undefined) => void,
) {
  useEffect(() => {
    handleSelectedDocumentReady(selectedDocument);
  }, [handleSelectedDocumentReady, selectedDocument]);
}
