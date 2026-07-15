import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { NoteSummary } from '@/lib/electron-api';
import type { FolderTreeNote } from '@/lib/hackmd-folders';

import { noteIdentityMatches, type NoteIdentity } from './note-workspace';

export type WorkbenchAutoSelectionOptions = {
  autoSelectSuppressionRef: MutableRefObject<string | null>;
  hasActiveDocument: boolean;
  manualEmptyWorkspaceRef: MutableRefObject<boolean>;
  requestSelectNote: (note: NoteSummary, options?: { focusEditor?: boolean; trackRecent?: boolean }) => Promise<boolean>;
  scopeStorageKey: string;
  selectedFolderId: string | null;
  selectedNote: NoteIdentity | null;
  visibleEntries: FolderTreeNote[];
};

export type WorkbenchAutoSelectionState = {
  getAutoSelectSuppressionKey: (note: NoteSummary | null) => string;
};

export function useWorkbenchAutoSelection({
  autoSelectSuppressionRef,
  hasActiveDocument,
  manualEmptyWorkspaceRef,
  requestSelectNote,
  scopeStorageKey,
  selectedFolderId,
  selectedNote,
  visibleEntries,
}: WorkbenchAutoSelectionOptions): WorkbenchAutoSelectionState {
  const getAutoSelectSuppressionKey = useCallback((note: NoteSummary | null) => [
    scopeStorageKey,
    selectedFolderId ?? 'workspace',
    selectedNote?.id ?? 'none',
    note?.id ?? 'none',
  ].join(':'), [scopeStorageKey, selectedFolderId, selectedNote?.id]);

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

    if (selectedNote || hasActiveDocument) {
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
  }, [
    autoSelectSuppressionRef,
    getAutoSelectSuppressionKey,
    hasActiveDocument,
    manualEmptyWorkspaceRef,
    requestSelectNote,
    selectedNote,
    visibleEntries,
  ]);

  return {
    getAutoSelectSuppressionKey,
  };
}
