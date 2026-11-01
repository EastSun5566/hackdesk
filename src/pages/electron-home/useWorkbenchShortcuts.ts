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

import { canRunContextShortcut, EDITING_SELECTOR, hasWorkbenchPopup } from './workbench-keyboard-context';

// Space activates these itself, so it opens the leader menu only elsewhere. Tree items and tabs open
// with Enter, which leaves Space free there.
const REGION_ACTIONS: ElectronActionId[] = ['focus-next-region', 'focus-previous-region'];

const SPACE_CONTROLS ='button:not([role="treeitem"]):not([role="tab"]), [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], [role="option"], summary, a[href]';

function opensLeaderMenu(event: KeyboardEvent, enabled: boolean) {
  if (!enabled || event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  const target = event.target instanceof Element ? event.target : null;
  return !hasWorkbenchPopup() && !target?.closest(EDITING_SELECTOR) && !target?.closest(SPACE_CONTROLS);
}

export type WorkbenchShortcutHandlers = {
  activeFinderState: NoteFinderState;
  closeTransientLayer: () => boolean;
  handleCreateNote: () => void;
  noteDirty: boolean;
  openPalette: () => void;
  /** Opens the leader menu; Space does too, outside text editing. */
  openLeaderMenu?: () => void;
  platform: string;
  refreshWorkspace: () => void;
  /** Runs a shortcut's action quietly; an unavailable action returns 'unavailable' and still takes the key. */
  runAction: (actionId: ElectronActionId) => void | boolean | 'unavailable';
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
  openLeaderMenu,
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

    if (openLeaderMenu && opensLeaderMenu(event, characterShortcutsEnabled)) {
      event.preventDefault();
      openLeaderMenu();
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
      // An unavailable action still takes the key, which on macOS keeps the app menu from running it
      // again; on Windows and Linux the menu gets the key first and marks the command as a shortcut.
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
    openLeaderMenu,
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
    // The notifications viewport also listens on window and takes F6 to focus itself. Region keys
    // are handled on document, which hears them first, so they keep cycling while a toast shows.
    const handleRegionKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const isRegionKey = REGION_ACTIONS.some(id =>
        matchShortcutConfig(resolveWorkbenchShortcut(id, shortcuts, characterShortcutsEnabled), event, platform));
      if (!isRegionKey) return;
      handleGlobalKeyDown(event);
      if (event.defaultPrevented) event.stopPropagation();
    };
    document.addEventListener('keydown', handleRegionKeyDown);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleRegionKeyDown);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [characterShortcutsEnabled, handleGlobalKeyDown, platform, shortcuts]);
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
