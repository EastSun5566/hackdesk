import { createFlowStore, type FlowPlan, type FlowStore } from './flow-store';

/**
 * Opening a row that belongs to another folder of the open named set, as one state machine.
 *
 * The folder opens first (a focus change: the set keeps its tabs), then the row's step runs once
 * the folder's tree is on screen. A click while a folder is opening only replaces the target: the
 * last click wins, and one switch runs at a time instead of a second failing on the first. A set's
 * folder chosen in the switcher opens the set first, then that folder in it.
 */
export type FolderSwitchTarget =
  | { kind: 'root'; vaultId: string; action?: 'create-note' | 'create-folder' }
  | { kind: 'folder'; vaultId: string; folderIds: string[]; action?: 'create-note' | 'create-folder' | 'rename' | 'move' | 'edit' | 'delete' | 'reveal'; name?: string }
  | { kind: 'note'; vaultId: string; noteId: string };

/** What the window shows when a step is planned or a row is clicked. */
export type FolderSwitchWorld = {
  activeVaultId: string | null;
  /** The open folder's snapshot. */
  snapshotId: string | null;
  /** The named set the window shows, or null on a folder open on its own or another workspace. */
  openSetId: string | null;
  hasFolder: (folderId: string) => boolean;
  hasNote: (noteId: string) => boolean;
};

export type FolderSwitchState = {
  /** The last click's target, until its step runs. */
  target: FolderSwitchTarget | null;
  /** The snapshot on screen when it was clicked; a new one proves the tree changed folder. */
  originSnapshotId: string | null;
  /** The folder a switch is running to. */
  switchingTo: string | null;
  /** The folder the flow has opened; settings can still show the one it left. */
  current: string | null;
  /** A set's folder chosen in the switcher, opened once the set is. */
  setFolder: { workspaceId: string; vaultId: string } | null;
};

export type FolderSwitchEvent =
  | { type: 'requested'; target: FolderSwitchTarget; at: Pick<FolderSwitchWorld, 'activeVaultId' | 'snapshotId'> }
  | { type: 'switch_started'; vaultId: string }
  | { type: 'switched'; vaultId: string }
  | { type: 'switch_failed' }
  | { type: 'applied' }
  | { type: 'set_requested'; workspaceId: string; vaultId: string }
  | { type: 'set_opened' }
  | { type: 'set_failed' };

export type FolderSwitchCommand =
  | { type: 'switch_vault'; vaultId: string }
  | { type: 'apply'; target: FolderSwitchTarget };

export const INITIAL_FOLDER_SWITCH: FolderSwitchState = { target: null, originSnapshotId: null, switchingTo: null, current: null, setFolder: null };

export function folderSwitchReducer(state: FolderSwitchState, event: FolderSwitchEvent): FolderSwitchState {
  switch (event.type) {
    case 'requested':
      return {
        ...state,
        target: event.target,
        originSnapshotId: event.at.snapshotId,
        // While a flow runs, settings may still show the folder it left: keep the one it opened.
        current: state.target || state.switchingTo ? state.current : event.at.activeVaultId,
      };
    case 'switch_started':
      return { ...state, switchingTo: event.vaultId };
    case 'switched':
      return { ...state, switchingTo: null, current: event.vaultId };
    case 'switch_failed':
      return { ...state, switchingTo: null, target: null };
    case 'applied':
      return state.target ? { ...state, target: null } : state;
    case 'set_requested':
      return { ...state, setFolder: { workspaceId: event.workspaceId, vaultId: event.vaultId } };
    case 'set_opened':
    case 'set_failed':
      return state.setFolder ? { ...state, setFolder: null } : state;
  }
}

/** Whether a switch is running; a row in the open folder then waits its turn too. */
export function isSwitchingFolder(state: FolderSwitchState) {
  return state.switchingTo !== null;
}

function isReady(target: FolderSwitchTarget, originSnapshotId: string | null, world: FolderSwitchWorld) {
  if (world.activeVaultId !== target.vaultId) return false;
  if (!world.snapshotId || world.snapshotId === originSnapshotId) return false;
  if (target.kind === 'note') return world.hasNote(target.noteId);
  if (target.kind === 'folder') {
    const leafFolderId = target.folderIds.at(-1);
    return leafFolderId !== undefined && world.hasFolder(leafFolderId);
  }
  return true;
}

const NOTHING: FlowPlan<FolderSwitchEvent, FolderSwitchCommand> = { events: [], commands: [] };

export function planFolderSwitch(state: FolderSwitchState, world: FolderSwitchWorld): FlowPlan<FolderSwitchEvent, FolderSwitchCommand> {
  if (state.setFolder && state.setFolder.workspaceId === world.openSetId && world.snapshotId) {
    const { vaultId } = state.setFolder;
    const events: FolderSwitchEvent[] = [{ type: 'set_opened' }];
    if (vaultId !== world.activeVaultId) events.push({ type: 'requested', target: { kind: 'root', vaultId }, at: { activeVaultId: world.activeVaultId, snapshotId: world.snapshotId } });
    return { events, commands: [] };
  }
  const { target } = state;
  if (!target || state.switchingTo) return NOTHING;
  if (target.vaultId !== state.current) {
    return { events: [{ type: 'switch_started', vaultId: target.vaultId }], commands: [{ type: 'switch_vault', vaultId: target.vaultId }] };
  }
  if (!isReady(target, state.originSnapshotId, world)) return NOTHING;
  return { events: [{ type: 'applied' }], commands: [{ type: 'apply', target }] };
}

export type FolderSwitchStore = FlowStore<FolderSwitchState, FolderSwitchEvent, FolderSwitchWorld, FolderSwitchCommand>;

export function createFolderSwitchStore(): FolderSwitchStore {
  return createFlowStore(INITIAL_FOLDER_SWITCH, folderSwitchReducer, planFolderSwitch);
}
