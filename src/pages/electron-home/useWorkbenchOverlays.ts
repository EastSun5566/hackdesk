import { useCallback, useMemo, useReducer } from 'react';

import type { DocumentSummary } from '@/lib/electron-api';
import type { FolderTreeNode } from '@/lib/hackmd-folders';

import type { SettingsTab } from './SettingsDialogConfig';
import type {
  CommandPaletteState,
  CreateFolderDialogState,
  CreateNoteDialogState,
  RenameFolderDialogState,
} from './types';
import {
  getTopOverlay,
  INITIAL_OVERLAYS,
  overlaysReducer,
  type OverlayEvent,
  type OverlayKey,
  type WorkbenchOverlays,
} from './workbench-overlays';

function set<K extends OverlayKey>(key: K, value: WorkbenchOverlays[K]) {
  return { type: 'set', key, value } as OverlayEvent;
}

/**
 * The workbench's overlays in one place. The named setters keep each call site's current shape
 * while the call sites move to `dispatch` (#362).
 */
export function useWorkbenchOverlays() {
  const [overlays, dispatch] = useReducer(overlaysReducer, INITIAL_OVERLAYS);

  const setters = useMemo(() => ({
    setPalette: (value: CommandPaletteState) => dispatch(set('palette', value)),
    setCreateDialog: (value: CreateNoteDialogState) => dispatch(set('createNote', value)),
    setCreateFolderDialog: (value: CreateFolderDialogState) => dispatch(set('createFolder', value)),
    setRenameFolderDialog: (value: RenameFolderDialogState) => dispatch(set('renameFolder', value)),
    setDeleteTarget: (value: DocumentSummary | null) => dispatch(set('deleteNote', value)),
    setDeleteFolderTarget: (value: FolderTreeNode | null) => dispatch(set('deleteFolder', value)),
    /** Opens Settings on its first tab, or closes it; `openSettings` opens it on another tab. */
    setSettingsOpen: (open: boolean) => dispatch(open ? { type: 'open_settings', tab: 'general' } : { type: 'close', key: 'settings' }),
    openSettings: (tab: SettingsTab) => dispatch({ type: 'open_settings', tab }),
    setShareOpen: (open: boolean) => dispatch(set('share', open)),
    setVersionsOpen: (open: boolean) => dispatch(set('versions', open)),
    setTrashOpen: (open: boolean) => dispatch(set('trash', open)),
    setHistoryOpen: (open: boolean) => dispatch(set('history', open)),
    setShortcutHelp: (value: WorkbenchOverlays['shortcutHelp']) => dispatch(set('shortcutHelp', value)),
    setDestinationOpen: (open: boolean) => dispatch(set('destination', open)),
    setOnboardingOpen: (open: boolean) => dispatch(set('onboarding', open)),
    setWorkspaceSwitcherOpen: (open: boolean) => dispatch(set('workspaceSwitcher', open)),
    setLeaderPath: (path: string[] | null) => dispatch(set('leaderPath', path)),
  }), []);

  // Depends only on which overlay is on top, so typing in the palette does not give keyboard
  // and close-request listeners a new callback on every key.
  const top = getTopOverlay(overlays);
  /** Closes the top overlay in the workbench's close order; false when none is open. */
  const closeTopOverlay = useCallback(() => {
    if (!top) return false;
    dispatch({ type: 'close', key: top });
    return true;
  }, [top]);

  return {
    overlays,
    dispatch,
    closeTopOverlay,
    ...setters,
    palette: overlays.palette,
    createDialog: overlays.createNote,
    createFolderDialog: overlays.createFolder,
    renameFolderDialog: overlays.renameFolder,
    deleteTarget: overlays.deleteNote,
    deleteFolderTarget: overlays.deleteFolder,
    settingsOpen: overlays.settings.open,
    settingsInitialTab: overlays.settings.tab,
    shareOpen: overlays.share,
    versionsOpen: overlays.versions,
    trashOpen: overlays.trash,
    historyOpen: overlays.history,
    shortcutHelp: overlays.shortcutHelp,
    destinationOpen: overlays.destination,
    onboardingOpen: overlays.onboarding,
    workspaceSwitcherOpen: overlays.workspaceSwitcher,
    leaderPath: overlays.leaderPath,
  };
}

export type WorkbenchOverlayState = ReturnType<typeof useWorkbenchOverlays>;
