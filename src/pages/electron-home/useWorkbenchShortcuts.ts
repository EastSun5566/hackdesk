import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ElectronActionId } from '@/lib/electron-api';
import { ELECTRON_ACTIONS, getElectronAction, resolveWorkbenchShortcut } from '@/lib/electron-actions';
import {
  clearNoteFinderFilters,
  clearNoteFinderQuery,
  hasActiveNoteFinderFilters,
  type NoteFinderState,
} from '@/lib/electron-note-finder';
import {
  matchShortcutConfig,
  type ShortcutOverrides,
} from '@/lib/keyboard-shortcuts';

import { canRunContextShortcut, hasWorkbenchPopup } from './workbench-keyboard-context';

export type WorkbenchShortcutHandlers = {
  activeFinderState: NoteFinderState;
  closeTransientLayer: () => boolean;
  handleCreateNote: () => void;
  noteDirty: boolean;
  openPalette: () => void;
  platform: string;
  refreshWorkspace: () => void;
  runAction: (actionId: ElectronActionId) => void | boolean;
  selectedFolderId: string | null;
  setFinderState: Dispatch<SetStateAction<NoteFinderState>>;
  setSelectedFolderId: Dispatch<SetStateAction<string | null>>;
  shortcuts?: ShortcutOverrides;
  characterShortcutsEnabled?: boolean;
  switchWorkspaceAtIndex: (workspaceIndex: number) => boolean;
};

export function useWorkbenchShortcuts({
  activeFinderState,
  closeTransientLayer,
  handleCreateNote,
  noteDirty,
  openPalette,
  platform,
  refreshWorkspace,
  runAction,
  selectedFolderId,
  setFinderState,
  setSelectedFolderId,
  shortcuts,
  characterShortcutsEnabled = true,
  switchWorkspaceAtIndex,
}: WorkbenchShortcutHandlers) {
  const handleGlobalKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.repeat) {
      return;
    }

    const isPrimaryModifier = isPlatformPrimaryModifier(event, platform);
    if (isPrimaryModifier && !event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
      if (switchWorkspaceAtIndex(Number(event.key) - 1)) {
        event.preventDefault();
      }
      return;
    }

    if (matchesActionShortcut('save-note', event, platform, shortcuts)) {
      if (noteDirty) {
        event.preventDefault();
        runAction('save-note');
      }
      return;
    }

    const matchedAction = ELECTRON_ACTIONS.find(action => {
      if (action.id === 'save-note') return false;
      const config = resolveWorkbenchShortcut(action.id, shortcuts, characterShortcutsEnabled);
      return matchShortcutConfig(config, event, platform)
        && (!action.keyboardContext || canRunContextShortcut(action.id, event.target, event));
    })?.id;
    if (matchedAction) {
      const context = getElectronAction(matchedAction).keyboardContext;
      if (!context && hasWorkbenchPopup()) return;
      if (matchedAction === 'open-command-palette') openPalette();
      else if (matchedAction === 'new-note') handleCreateNote();
      else if (matchedAction === 'refresh') refreshWorkspace();
      else if (runAction(matchedAction) === false) return;
      event.preventDefault();
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
    handleCreateNote,
    noteDirty,
    openPalette,
    platform,
    refreshWorkspace,
    runAction,
    selectedFolderId,
    setFinderState,
    setSelectedFolderId,
    shortcuts,
    characterShortcutsEnabled,
    switchWorkspaceAtIndex,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);
}

function matchesActionShortcut(
  actionId: ElectronActionId,
  event: KeyboardEvent,
  platform: string,
  shortcuts?: ShortcutOverrides,
) {
  return matchShortcutConfig(
    resolveWorkbenchShortcut(actionId, shortcuts),
    event,
    platform,
  );
}

function isPlatformPrimaryModifier(event: KeyboardEvent, platform: string) {
  const isMac = platform === 'darwin' || platform.toLowerCase().includes('mac');
  return isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}
