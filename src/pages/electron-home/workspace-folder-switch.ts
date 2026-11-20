/**
 * Opening something in another folder of the open named set, as one state machine instead of
 * refs and effects reacting to each other.
 *
 * A row in another folder's tree (a folder, a note, or an action on one) asks for that folder.
 * The window switches to it, waits until its snapshot is on screen (the snapshot id proves the tree
 * now belongs to it), then shows the folder or runs the action there. Clicks while a switch runs
 * only replace the target: the last click wins, instead of a second switch failing because the
 * first is still running. A folder picked in the switcher from a set that is not open opens the
 * set first, then that folder in it.
 */
export type FolderAction = 'create-note' | 'create-folder' | 'rename' | 'move' | 'edit' | 'delete' | 'reveal';

export type FolderSwitchTarget =
  | { kind: 'root'; vaultId: string; action?: 'create-note' | 'create-folder' }
  | { kind: 'folder'; vaultId: string; folderIds: string[]; action?: FolderAction; name?: string }
  | { kind: 'note'; vaultId: string; noteId: string };

export type FolderSwitchState = {
  /** What to show or do once its folder's snapshot is on screen, and the snapshot it was asked from. */
  target: (FolderSwitchTarget & { originSnapshotId: string | null }) | null;
  /** The folder a switch is opening; null while none runs. */
  switching: string | null;
  /** The folder the last switch opened, until the settings show it open. */
  switchedTo: string | null;
  /** A folder picked in the switcher from a named set that is not open yet. */
  setPick: { workspaceId: string; vaultId: string } | null;
};

export type FolderSwitchEvent =
  | { type: 'requested'; target: FolderSwitchTarget; snapshotId: string | null }
  | { type: 'set_picked'; workspaceId: string; vaultId: string }
  | { type: 'set_pick_failed' }
  | { type: 'set_opened' }
  | { type: 'switch_started'; vaultId: string }
  | { type: 'switch_finished'; vaultId: string }
  | { type: 'switch_failed' }
  | { type: 'switch_seen' }
  | { type: 'arrived' };

/** What the window knows when the plan runs. */
export type FolderSwitchWorld = {
  /** The open folder, as the settings say. */
  activeVaultId: string | null;
  /** The snapshot on screen; a new one means the tree was read again. */
  snapshotId: string | null;
  /** The named set the window shows, or null when it shows something else. */
  activeSetId: string | null;
  /** Where a note lives in the tree on screen (folder ids from the top), or undefined if it isn't there. */
  noteFolderIds: (noteId: string) => string[] | undefined;
  hasFolder: (folderId: string) => boolean;
};

export type FolderSwitchCommand =
  | { type: 'switch_vault'; vaultId: string }
  /** Expand these folders and select the last one (the unfiled notes when there is none). */
  | { type: 'show_folder'; folderIds: string[] }
  /** Run the action in this folder (null: the folder's top level). */
  | { type: 'run_action'; action: FolderAction; folderId: string | null; name?: string };

export const initialFolderSwitchState: FolderSwitchState = { target: null, switching: null, switchedTo: null, setPick: null };

export function folderSwitchReducer(state: FolderSwitchState, event: FolderSwitchEvent): FolderSwitchState {
  switch (event.type) {
    case 'requested':
      return { ...state, target: { ...event.target, originSnapshotId: event.snapshotId } };
    case 'set_picked':
      return { ...state, setPick: { workspaceId: event.workspaceId, vaultId: event.vaultId } };
    case 'set_pick_failed':
    case 'set_opened':
      return state.setPick === null ? state : { ...state, setPick: null };
    case 'switch_started':
      return { ...state, switching: event.vaultId };
    case 'switch_finished':
      return { ...state, switching: null, switchedTo: event.vaultId };
    case 'switch_failed':
      return { ...state, target: null, switching: null };
    case 'switch_seen':
      return state.switchedTo === null ? state : { ...state, switchedTo: null };
    case 'arrived':
      return { ...state, target: null, switchedTo: null };
  }
}

/** The steps that show the target, once its folder's tree is on screen; null while it isn't yet. */
function arrive(target: NonNullable<FolderSwitchState['target']>, world: FolderSwitchWorld): FolderSwitchCommand[] | null {
  if (world.activeVaultId !== target.vaultId) return null;
  if (!world.snapshotId || world.snapshotId === target.originSnapshotId) return null;
  if (target.kind === 'root') {
    return target.action ? [{ type: 'run_action', action: target.action, folderId: null }] : [];
  }
  if (target.kind === 'note') {
    const folderIds = world.noteFolderIds(target.noteId);
    // The note is already open; only show where it lives.
    return folderIds ? [{ type: 'show_folder', folderIds }] : null;
  }
  const folderId = target.folderIds.at(-1);
  if (!folderId || !world.hasFolder(folderId)) return null;
  const commands: FolderSwitchCommand[] = [{ type: 'show_folder', folderIds: target.folderIds }];
  if (target.action && (target.action !== 'rename' || target.name)) {
    commands.push({ type: 'run_action', action: target.action, folderId, name: target.name });
  }
  return commands;
}

/**
 * The next steps from where the switch stands: the events to record and the commands to run. Pure,
 * so every transition is a table test; the window runs it whenever what it reads changes.
 */
export function planFolderSwitch(state: FolderSwitchState, world: FolderSwitchWorld): { events: FolderSwitchEvent[]; commands: FolderSwitchCommand[] } {
  const events: FolderSwitchEvent[] = [];
  const commands: FolderSwitchCommand[] = [];
  let current = state;
  const take = (event: FolderSwitchEvent) => {
    events.push(event);
    current = folderSwitchReducer(current, event);
  };

  // A set picked in the switcher is open with a snapshot: its folder opens next, if it isn't open already.
  if (current.setPick && world.activeSetId === current.setPick.workspaceId && world.snapshotId) {
    const { vaultId } = current.setPick;
    take({ type: 'set_opened' });
    if (vaultId !== world.activeVaultId) take({ type: 'requested', target: { kind: 'root', vaultId }, snapshotId: world.snapshotId });
  }

  if (current.switchedTo !== null && current.switchedTo === world.activeVaultId) take({ type: 'switch_seen' });
  const openVaultId = current.switchedTo ?? world.activeVaultId;
  if (current.target && current.switching === null && current.target.vaultId !== openVaultId) {
    take({ type: 'switch_started', vaultId: current.target.vaultId });
    commands.push({ type: 'switch_vault', vaultId: current.target.vaultId });
    return { events, commands };
  }

  if (current.target) {
    const arrival = arrive(current.target, world);
    if (arrival) {
      take({ type: 'arrived' });
      commands.push(...arrival);
    }
  }
  return { events, commands };
}

export type FolderSwitchStore = {
  getState: () => FolderSwitchState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (event: FolderSwitchEvent) => void;
  /**
   * Plans from the current state, records the plan's events at once and returns its commands.
   * Recording before the commands run means a second call finds the steps already taken and
   * repeats none of them, as in workbench-startup: a command's own update can render first (the
   * rename mutation's state renders synchronously) and run the driver again.
   */
  advance: (world: FolderSwitchWorld) => FolderSwitchCommand[];
};

export function createFolderSwitchStore(initial: FolderSwitchState = initialFolderSwitchState): FolderSwitchStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const dispatch = (event: FolderSwitchEvent) => {
    const next = folderSwitchReducer(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispatch,
    advance: (world) => {
      const { events, commands } = planFolderSwitch(state, world);
      for (const event of events) dispatch(event);
      return commands;
    },
  };
}
