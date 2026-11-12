import type { DocumentSummary } from '@/lib/electron-api';
import type { FolderTreeNode } from '@/lib/hackmd-folders';

import type { SettingsTab } from './SettingsDialogConfig';
import type {
  CommandPaletteState,
  CreateFolderDialogState,
  CreateNoteDialogState,
  RenameFolderDialogState,
} from './types';
import type { ElectronFocusZone } from './useElectronFocusZones';

/**
 * Everything the workbench shows over or beside the note: dialogs, the command palette, sidebar
 * panels and menus. Each one keeps its value while closed, so its content stays put while it
 * animates out. Several can be open at once (a dialog over the Trash panel, say).
 */
export type WorkbenchOverlays = {
  palette: CommandPaletteState;
  createNote: CreateNoteDialogState;
  createFolder: CreateFolderDialogState;
  renameFolder: RenameFolderDialogState;
  /** The note waiting for delete confirmation. */
  deleteNote: DocumentSummary | null;
  /** The folder waiting for delete confirmation. */
  deleteFolder: FolderTreeNode | null;
  /** `tab` is where Settings opens. */
  settings: { open: boolean; tab: SettingsTab };
  share: boolean;
  versions: boolean;
  /** The Trash panel in the sidebar. */
  trash: boolean;
  /** The History panel in the sidebar. */
  history: boolean;
  /** Keyboard shortcut help for a region, and where focus goes back to. */
  shortcutHelp: { region: ElectronFocusZone; target: HTMLElement | null } | null;
  /** The note destination picker. */
  destination: boolean;
  onboarding: boolean;
  workspaceSwitcher: boolean;
  /** The keys typed into the leader menu so far, or null while it is closed. */
  leaderPath: string[] | null;
};

export type OverlayKey = keyof WorkbenchOverlays;

export function createClosedFolderDialogState(): CreateFolderDialogState {
  return { open: false, name: '', description: '', icon: '', color: '' };
}

export function createClosedRenameFolderDialogState(): RenameFolderDialogState {
  return { open: false, folderId: null, name: '', description: '', icon: '', color: '' };
}

export const INITIAL_OVERLAYS: WorkbenchOverlays = {
  palette: { mode: 'commands', open: false, search: '' },
  createNote: { open: false, title: '' },
  createFolder: createClosedFolderDialogState(),
  renameFolder: createClosedRenameFolderDialogState(),
  deleteNote: null,
  deleteFolder: null,
  settings: { open: false, tab: 'general' },
  share: false,
  versions: false,
  trash: false,
  history: false,
  shortcutHelp: null,
  destination: false,
  onboarding: false,
  workspaceSwitcher: false,
  leaderPath: null,
};

/**
 * What Escape on the workbench and the window close button take down, one at a time, first to last.
 * It is a fixed order, not the order they opened in. A dialog handles Escape inside itself, so
 * this order only applies when focus is outside every open dialog, and to the close button.
 * Menus and pickers not listed here close themselves.
 */
export const OVERLAY_CLOSE_ORDER = [
  'shortcutHelp',
  'palette',
  'share',
  'versions',
  'trash',
  'createNote',
  'createFolder',
  'deleteNote',
  'deleteFolder',
  'renameFolder',
  'settings',
  'history',
] as const satisfies readonly OverlayKey[];

/** Overlays whose value says `open` itself; the others are open while they hold a value. */
const OPEN_FLAG_KEYS = new Set<OverlayKey>(['palette', 'createNote', 'createFolder', 'renameFolder', 'settings']);

export function isOverlayOpen(overlays: WorkbenchOverlays, key: OverlayKey): boolean {
  const value = overlays[key];
  if (OPEN_FLAG_KEYS.has(key)) return (value as { open: boolean }).open;
  return value !== null && value !== false;
}

/** The overlay that closes next, or null when none in the close order is open. */
export function getTopOverlay(overlays: WorkbenchOverlays): OverlayKey | null {
  return OVERLAY_CLOSE_ORDER.find((key) => isOverlayOpen(overlays, key)) ?? null;
}

function closedValue<K extends OverlayKey>(key: K, current: WorkbenchOverlays[K]): WorkbenchOverlays[K] {
  if (key === 'settings') return { ...(current as WorkbenchOverlays['settings']), open: false } as WorkbenchOverlays[K];
  if (key === 'createFolder') return createClosedFolderDialogState() as WorkbenchOverlays[K];
  if (key === 'renameFolder') return createClosedRenameFolderDialogState() as WorkbenchOverlays[K];
  return INITIAL_OVERLAYS[key];
}

export type OverlayEvent =
  | { [K in OverlayKey]: { type: 'set'; key: K; value: WorkbenchOverlays[K] } }[OverlayKey]
  /** Closes one overlay and clears what it held. */
  | { type: 'close'; key: OverlayKey }
  | { type: 'open_settings'; tab: SettingsTab };

/** Trash and History take the same place in the sidebar, so opening one closes the other. */
const SIDEBAR_PANELS = { trash: 'history', history: 'trash' } as const;

export function overlaysReducer(state: WorkbenchOverlays, event: OverlayEvent): WorkbenchOverlays {
  switch (event.type) {
    case 'set': {
      if (Object.is(state[event.key], event.value)) return state;
      const next = { ...state, [event.key]: event.value };
      if ((event.key === 'trash' || event.key === 'history') && event.value) next[SIDEBAR_PANELS[event.key]] = false;
      return next;
    }
    case 'close':
      return isOverlayOpen(state, event.key) ? { ...state, [event.key]: closedValue(event.key, state[event.key]) } : state;
    case 'open_settings':
      return { ...state, settings: { open: true, tab: event.tab } };
  }
}

/** How the workbench changes its overlays. Stable for the life of the workbench. */
export type OverlayControls = {
  set: <K extends OverlayKey>(key: K, value: WorkbenchOverlays[K]) => void;
  /** Closes an overlay and clears what it held. */
  close: (key: OverlayKey) => void;
  /** Opens Settings, on its first tab unless another is named. */
  openSettings: (tab?: SettingsTab) => void;
};
