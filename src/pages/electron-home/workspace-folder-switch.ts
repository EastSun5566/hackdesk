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
 *
 * Anything else that opens a folder or leaves the set (the folder list, the set switcher, the
 * command palette, Settings) abandons the target: the user moved on. The machine notices that
 * itself, from a folder it never saw or caused, or from another set, so no caller has to report it.
 */
export type FolderAction = 'create-note' | 'create-folder' | 'rename' | 'move' | 'edit' | 'delete' | 'reveal';

export type FolderSwitchTarget =
  | { kind: 'root'; vaultId: string; action?: 'create-note' | 'create-folder' }
  | { kind: 'folder'; vaultId: string; folderIds: string[]; action?: FolderAction; name?: string }
  | { kind: 'note'; vaultId: string; noteId: string };

/** Where the window stood when something was asked for. */
type Origin = { snapshotId: string | null; vaultId: string | null; setId: string | null };

export type FolderSwitchState = {
  /** What to show or do once its folder's snapshot is on screen, and where the window stood when asked. */
  target: (FolderSwitchTarget & { originSnapshotId: string | null; originSetId: string | null }) | null;
  /** The folder a switch is opening; null while none runs. */
  switching: string | null;
  /**
   * The folders open while the target was asked for or switched to. Any other folder open means
   * something else moved the window.
   */
  knownVaultIds: string[];
  /** A folder picked in the switcher from a named set that is not open yet. */
  setPick: { workspaceId: string; vaultId: string } | null;
};

export type FolderSwitchEvent =
  | { type: 'requested'; target: FolderSwitchTarget; origin: Origin }
  | { type: 'set_picked'; workspaceId: string; vaultId: string }
  /** Something was opened by another path; the target no longer counts. */
  | { type: 'abandoned' }
  | { type: 'set_pick_failed' }
  | { type: 'set_opened' }
  | { type: 'switch_started'; vaultId: string }
  | { type: 'switch_finished' }
  | { type: 'switch_failed' }
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

export const initialFolderSwitchState: FolderSwitchState = { target: null, switching: null, knownVaultIds: [], setPick: null };

const withVault = (vaultIds: string[], vaultId: string | null) => (vaultId === null || vaultIds.includes(vaultId) ? vaultIds : [...vaultIds, vaultId]);

export function folderSwitchReducer(state: FolderSwitchState, event: FolderSwitchEvent): FolderSwitchState {
  switch (event.type) {
    case 'requested':
      return {
        ...state,
        target: { ...event.target, originSnapshotId: event.origin.snapshotId, originSetId: event.origin.setId },
        // A click while another target waits extends the same chain of switches.
        knownVaultIds: withVault(withVault(state.target ? state.knownVaultIds : [], state.switching), event.origin.vaultId),
      };
    case 'set_picked':
      return {
        ...folderSwitchReducer(state, { type: 'abandoned' }),
        setPick: { workspaceId: event.workspaceId, vaultId: event.vaultId },
      };
    case 'abandoned':
      return state.target === null && state.setPick === null ? state : { ...state, target: null, knownVaultIds: [], setPick: null };
    case 'set_pick_failed':
    case 'set_opened':
      return state.setPick === null ? state : { ...state, setPick: null };
    case 'switch_started':
      return { ...state, switching: event.vaultId, knownVaultIds: withVault(state.knownVaultIds, event.vaultId) };
    case 'switch_finished':
      return state.switching === null ? state : { ...state, switching: null };
    case 'switch_failed':
      return { ...state, target: null, switching: null, knownVaultIds: [] };
    case 'arrived':
      return { ...state, target: null, knownVaultIds: [] };
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

/** Something other than this machine opened a folder or left the set while the target waited. */
function movedElsewhere(state: FolderSwitchState, world: FolderSwitchWorld) {
  if (!state.target) return false;
  if (world.activeSetId !== state.target.originSetId) return true;
  // Reaching the target's own folder is never elsewhere, whoever opened it.
  const vaultId = world.activeVaultId;
  return vaultId !== null && vaultId !== state.target.vaultId && !state.knownVaultIds.includes(vaultId);
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
    if (vaultId !== world.activeVaultId) {
      take({ type: 'requested', target: { kind: 'root', vaultId }, origin: { snapshotId: world.snapshotId, vaultId: world.activeVaultId, setId: world.activeSetId } });
    }
  }

  if (movedElsewhere(current, world)) {
    take({ type: 'abandoned' });
    return { events, commands };
  }

  // Compared with the settings as they are now, like the click handler's loop it replaces: a switch
  // to the folder that just opened, before the settings reach React, finds it open and does nothing.
  if (current.target && current.switching === null && current.target.vaultId !== world.activeVaultId) {
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
