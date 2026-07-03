import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ElectronActionId } from '@/lib/electron-api';
import {
  clearNoteFinderFilters,
  clearNoteFinderQuery,
  hasActiveNoteFinderFilters,
  type NoteFinderState,
} from '@/lib/electron-note-finder';

export type WorkbenchShortcutHandlers = {
  activeFinderState: NoteFinderState;
  closeTransientLayer: () => boolean;
  focusPaneAtIndex: (paneIndex: number) => boolean;
  focusTabAtIndex: (tabIndex: number) => boolean;
  handleCreateNote: () => void;
  noteDirty: boolean;
  openPalette: () => void;
  paneCount: number;
  refreshWorkspace: () => void;
  runAction: (actionId: ElectronActionId) => void;
  selectedFolderId: string | null;
  setFinderState: Dispatch<SetStateAction<NoteFinderState>>;
  setSelectedFolderId: Dispatch<SetStateAction<string | null>>;
};

export function useWorkbenchShortcuts({
  activeFinderState,
  closeTransientLayer,
  focusPaneAtIndex,
  focusTabAtIndex,
  handleCreateNote,
  noteDirty,
  openPalette,
  paneCount,
  refreshWorkspace,
  runAction,
  selectedFolderId,
  setFinderState,
  setSelectedFolderId,
}: WorkbenchShortcutHandlers) {
  const handleGlobalKeyDown = useCallback((event: KeyboardEvent) => {
    const isPrimaryModifier = event.metaKey || event.ctrlKey;
    if (isPrimaryModifier && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openPalette();
      return;
    }

    if (isPrimaryModifier && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      runAction(event.shiftKey ? 'search-notes' : 'find-in-note');
      return;
    }

    if (isPrimaryModifier && !event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
      if (paneCount > 1) {
        const targetPaneIndex = Number(event.key) - 1;
        if (targetPaneIndex < 2 && focusPaneAtIndex(targetPaneIndex)) {
          event.preventDefault();
        }
        return;
      }

      const targetTabIndex = event.key === '9' ? -1 : Number(event.key) - 1;
      if (focusTabAtIndex(targetTabIndex)) {
        event.preventDefault();
      }
      return;
    }

    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'n') {
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

    if (isPrimaryModifier && event.key.toLowerCase() === 'w') {
      event.preventDefault();
      runAction('close-tab');
      return;
    }

    if (isPrimaryModifier && event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      runAction('reopen-last-closed-tab');
      return;
    }

    if (isPrimaryModifier && !event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      runAction('new-tab');
      return;
    }

    if (isPrimaryModifier && event.altKey && !event.shiftKey && event.key === 'ArrowRight') {
      event.preventDefault();
      runAction('focus-next-tab');
      return;
    }

    if (isPrimaryModifier && event.altKey && !event.shiftKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      runAction('focus-previous-tab');
      return;
    }

    if (isPrimaryModifier && !event.altKey && !event.shiftKey && event.key === '[') {
      event.preventDefault();
      runAction('navigate-back');
      return;
    }

    if (isPrimaryModifier && !event.altKey && !event.shiftKey && event.key === ']') {
      event.preventDefault();
      runAction('navigate-forward');
      return;
    }

    if (isPrimaryModifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      runAction('toggle-workspace-rail');
      return;
    }

    if (isPrimaryModifier && event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      runAction('toggle-navigator');
      return;
    }

    if (isPrimaryModifier && !event.altKey && event.key === '\\') {
      event.preventDefault();
      runAction('split-pane-right');
      return;
    }

    if (event.ctrlKey && event.key === 'Tab') {
      event.preventDefault();
      runAction(event.shiftKey ? 'focus-previous-tab' : 'focus-next-tab');
      return;
    }

    if (isPrimaryModifier && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      runAction('focus-navigator');
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

    if (event.altKey && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      runAction('toggle-inspector');
      return;
    }

    if (event.key !== 'Escape') {
      return;
    }

    if (closeTransientLayer()) {
      return;
    }

    const targetZone = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus
      : null;
    if (targetZone === 'editor' || targetZone === 'inspector') {
      return;
    }

    if (activeFinderState.query) {
      setFinderState((current) => clearNoteFinderQuery(current));
      return;
    }

    if (hasActiveNoteFinderFilters(activeFinderState)) {
      setFinderState((current) => clearNoteFinderFilters(current));
      return;
    }

    if (selectedFolderId) {
      setSelectedFolderId(null);
    }
  }, [
    activeFinderState,
    closeTransientLayer,
    focusPaneAtIndex,
    focusTabAtIndex,
    handleCreateNote,
    noteDirty,
    openPalette,
    paneCount,
    refreshWorkspace,
    runAction,
    selectedFolderId,
    setFinderState,
    setSelectedFolderId,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);
}
