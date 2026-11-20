import { describe, expect, it } from 'vitest';

import {
  createFolderSwitchStore,
  folderSwitchReducer,
  INITIAL_FOLDER_SWITCH,
  isSwitchingFolder,
  planFolderSwitch,
  type FolderSwitchCommand,
  type FolderSwitchStore,
  type FolderSwitchTarget,
  type FolderSwitchWorld,
} from './folder-switch';

function world(activeVaultId: string, snapshotId: string | null, tree: { folders?: string[]; notes?: string[] } = {}, openSetId: string | null = 'work'): FolderSwitchWorld {
  return {
    activeVaultId,
    snapshotId,
    openSetId,
    hasFolder: (id) => tree.folders?.includes(id) ?? false,
    hasNote: (id) => tree.notes?.includes(id) ?? false,
  };
}

/** Clicks a row, as the handlers do: record the target where the window stands, then plan. */
function request(store: FolderSwitchStore, target: FolderSwitchTarget, at: FolderSwitchWorld) {
  store.dispatch({ type: 'requested', target, at: { activeVaultId: at.activeVaultId, snapshotId: at.snapshotId } });
  return store.advance(at);
}

/** Runs a switch the plan asked for to its end, then plans again. */
function switched(store: FolderSwitchStore, commands: FolderSwitchCommand[], now: FolderSwitchWorld) {
  const command = commands.find((candidate) => candidate.type === 'switch_vault');
  if (!command) throw new Error('No switch was asked for.');
  store.dispatch({ type: 'switched', vaultId: command.vaultId });
  return store.advance(now);
}

describe('folder switch', () => {
  it('opens the folder, waits for its new tree to hold the target, then acts once', () => {
    const store = createFolderSwitchStore();
    const target: FolderSwitchTarget = { kind: 'folder', vaultId: 'b', folderIds: ['plans', 'q1'], action: 'create-note' };
    expect(request(store, target, world('a', 's-a'))).toEqual([{ type: 'switch_vault', vaultId: 'b' }]);
    expect(isSwitchingFolder(store.getState())).toBe(true);
    // Nothing more while the switch runs.
    expect(store.advance(world('a', 's-a'))).toEqual([]);

    // Settings lag behind the switch; then B's snapshot arrives before its tree holds the folder.
    expect(switched(store, [{ type: 'switch_vault', vaultId: 'b' }], world('a', 's-a'))).toEqual([]);
    expect(store.advance(world('b', 's-b'))).toEqual([]);
    expect(store.advance(world('b', 's-b', { folders: ['plans', 'q1'] }))).toEqual([{ type: 'apply', target }]);
    expect(store.advance(world('b', 's-b', { folders: ['plans', 'q1'] }))).toEqual([]);
  });

  it('acts only on a tree loaded after the click, never on the one shown when it was clicked', () => {
    const store = createFolderSwitchStore();
    // Settings already show B (a switch from elsewhere), but the tree on screen is the old one.
    const commands = request(store, { kind: 'root', vaultId: 'b', action: 'create-folder' }, world('b', 's-old'));
    expect(commands).toEqual([]);
    expect(store.advance(world('b', 's-old'))).toEqual([]);
    expect(store.advance(world('b', 's-b'))).toEqual([{ type: 'apply', target: { kind: 'root', vaultId: 'b', action: 'create-folder' } }]);
  });

  it('a note waits until the tree lists it', () => {
    const store = createFolderSwitchStore();
    const commands = request(store, { kind: 'note', vaultId: 'b', noteId: 'n' }, world('a', 's-a'));
    switched(store, commands, world('b', 's-b'));
    expect(store.advance(world('b', 's-b', { notes: ['n'] }))).toEqual([{ type: 'apply', target: { kind: 'note', vaultId: 'b', noteId: 'n' } }]);
  });

  it('the last click wins: clicks while switching replace the target, one switch at a time', () => {
    const store = createFolderSwitchStore();
    const first = request(store, { kind: 'root', vaultId: 'b' }, world('a', 's-a'));
    expect(request(store, { kind: 'root', vaultId: 'c' }, world('a', 's-a'))).toEqual([]);
    expect(request(store, { kind: 'note', vaultId: 'd', noteId: 'n' }, world('a', 's-a'))).toEqual([]);
    // B finishes opening; the flow goes straight on to D, never to C.
    const next = switched(store, first, world('a', 's-a'));
    expect(next).toEqual([{ type: 'switch_vault', vaultId: 'd' }]);
    switched(store, next, world('b', 's-b'));
    expect(store.advance(world('d', 's-d', { notes: ['n'] }))).toEqual([{ type: 'apply', target: { kind: 'note', vaultId: 'd', noteId: 'n' } }]);
  });

  it('a click back to the folder it just opened does not switch again while settings lag', () => {
    const store = createFolderSwitchStore();
    switched(store, request(store, { kind: 'root', vaultId: 'b' }, world('a', 's-a')), world('a', 's-a'));
    expect(request(store, { kind: 'folder', vaultId: 'b', folderIds: ['plans'] }, world('a', 's-a'))).toEqual([]);
    expect(store.advance(world('b', 's-b', { folders: ['plans'] }))).toEqual([{ type: 'apply', target: { kind: 'folder', vaultId: 'b', folderIds: ['plans'] } }]);
  });

  it('a failed switch drops the target; the next click starts from where the window stands', () => {
    const store = createFolderSwitchStore();
    request(store, { kind: 'root', vaultId: 'b' }, world('a', 's-a'));
    store.dispatch({ type: 'switch_failed' });
    expect(isSwitchingFolder(store.getState())).toBe(false);
    expect(store.advance(world('b', 's-b'))).toEqual([]);
    expect(request(store, { kind: 'root', vaultId: 'c' }, world('a', 's-a'))).toEqual([{ type: 'switch_vault', vaultId: 'c' }]);
  });

  it('a set chosen in the switcher opens first; then its folder opens in it', () => {
    const store = createFolderSwitchStore();
    store.dispatch({ type: 'set_requested', workspaceId: 'work', vaultId: 'b' });
    // A folder open on its own, then the set opening without its snapshot yet: wait.
    expect(store.advance(world('a', 's-a', {}, null))).toEqual([]);
    expect(store.advance(world('a', null))).toEqual([]);
    // The set is open: its folder becomes the target, and the next step switches to it.
    expect(store.advance(world('a', 's-a2'))).toEqual([]);
    expect(store.getState()).toMatchObject({ setFolder: null, target: { kind: 'root', vaultId: 'b' }, originSnapshotId: 's-a2' });
    expect(store.advance(world('a', 's-a2'))).toEqual([{ type: 'switch_vault', vaultId: 'b' }]);
  });

  it('a set whose folder is already the open one only opens the set', () => {
    const store = createFolderSwitchStore();
    store.dispatch({ type: 'set_requested', workspaceId: 'work', vaultId: 'b' });
    expect(store.advance(world('b', 's-b'))).toEqual([]);
    expect(store.getState()).toEqual(INITIAL_FOLDER_SWITCH);
    store.dispatch({ type: 'set_requested', workspaceId: 'work', vaultId: 'b' });
    store.dispatch({ type: 'set_failed' });
    expect(store.getState()).toEqual(INITIAL_FOLDER_SWITCH);
  });
});

describe('planFolderSwitch', () => {
  it('is pure: the same state and world plan the same steps, and plans nothing with no target', () => {
    expect(planFolderSwitch(INITIAL_FOLDER_SWITCH, world('a', 's-a'))).toEqual({ events: [], commands: [] });
    const state = folderSwitchReducer(INITIAL_FOLDER_SWITCH, { type: 'requested', target: { kind: 'root', vaultId: 'b' }, at: { activeVaultId: 'a', snapshotId: 's-a' } });
    expect(planFolderSwitch(state, world('a', 's-a'))).toEqual(planFolderSwitch(state, world('a', 's-a')));
    expect(state).toMatchObject({ current: 'a', originSnapshotId: 's-a' });
  });
});
