import { describe, expect, it } from 'vitest';

import {
  createFolderSwitchStore,
  folderSwitchReducer,
  initialFolderSwitchState,
  planFolderSwitch,
  type FolderSwitchState,
  type FolderSwitchWorld,
} from './workspace-folder-switch';

// Folder A (snapshot a-1) is open. Folder B has a Plans folder and a note in it.
const B_TREE = { notes: { 'note-1': ['plans'] } as Record<string, string[]>, folders: new Set(['plans']) };
const A_TREE = { notes: {} as Record<string, string[]>, folders: new Set<string>() };

function world(overrides: Partial<FolderSwitchWorld> & { tree?: typeof A_TREE } = {}): FolderSwitchWorld {
  const { tree = A_TREE, ...rest } = overrides;
  return {
    activeVaultId: 'vault-a',
    snapshotId: 'a-1',
    activeSetId: 'work',
    noteFolderIds: (noteId) => tree.notes[noteId],
    hasFolder: (folderId) => tree.folders.has(folderId),
    ...rest,
  };
}
/** Folder B's tree is on screen. */
const onB = (overrides: Partial<FolderSwitchWorld> = {}) => world({ activeVaultId: 'vault-b', snapshotId: 'b-1', tree: B_TREE, ...overrides });

const state = (overrides: Partial<FolderSwitchState> = {}): FolderSwitchState => ({ ...initialFolderSwitchState, ...overrides });
const target = (overrides: Partial<NonNullable<FolderSwitchState['target']>> = {}) => ({
  kind: 'folder', vaultId: 'vault-b', folderIds: ['plans'], originSnapshotId: 'a-1', ...overrides,
}) as NonNullable<FolderSwitchState['target']>;

describe('folderSwitchReducer', () => {
  it('records each step, and returns the same state when nothing changes', () => {
    const requested = folderSwitchReducer(initialFolderSwitchState, {
      type: 'requested', target: { kind: 'note', vaultId: 'vault-b', noteId: 'note-1' }, snapshotId: 'a-1',
    });
    expect(requested.target).toEqual({ kind: 'note', vaultId: 'vault-b', noteId: 'note-1', originSnapshotId: 'a-1' });

    const switching = folderSwitchReducer(requested, { type: 'switch_started', vaultId: 'vault-b' });
    expect(switching.switching).toBe('vault-b');
    const switched = folderSwitchReducer(switching, { type: 'switch_finished', vaultId: 'vault-b' });
    expect(switched).toMatchObject({ switching: null, switchedTo: 'vault-b' });
    expect(folderSwitchReducer(switched, { type: 'arrived' })).toMatchObject({ target: null, switchedTo: null });

    // A failed switch drops the target: nothing happens later when another switch lands there.
    expect(folderSwitchReducer(switching, { type: 'switch_failed' })).toMatchObject({ target: null, switching: null });
    expect(folderSwitchReducer(initialFolderSwitchState, { type: 'set_opened' })).toBe(initialFolderSwitchState);
    expect(folderSwitchReducer(initialFolderSwitchState, { type: 'switch_seen' })).toBe(initialFolderSwitchState);
  });
});

describe('abandoning a folder switch', () => {
  it('drops the target, the folder switched to and a set pick when something else opens', () => {
    const waiting = state({ target: target(), switchedTo: 'vault-b', setPick: { workspaceId: 'other', vaultId: 'vault-x' } });
    expect(folderSwitchReducer(waiting, { type: 'abandoned' })).toEqual(initialFolderSwitchState);
    expect(folderSwitchReducer(initialFolderSwitchState, { type: 'abandoned' })).toBe(initialFolderSwitchState);
  });

  it('records nothing from a switch that something else superseded (#432 review)', () => {
    // Named set {A, B, C}, A open. A row of B starts a switch to B; while it runs, C is opened from
    // the folder list, and B's switch then settles without the settings ever showing B.
    const store = createFolderSwitchStore();
    store.dispatch({ type: 'requested', target: { kind: 'folder', vaultId: 'vault-b', folderIds: ['plans'] }, snapshotId: 'a-1' });
    expect(store.advance(world())).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
    store.dispatch({ type: 'abandoned' });
    // Clicking B's row again before the superseded switch settles waits for it, then switches again.
    store.dispatch({ type: 'requested', target: { kind: 'folder', vaultId: 'vault-b', folderIds: ['plans'] }, snapshotId: 'c-1' });
    expect(store.advance(world({ activeVaultId: 'vault-c', snapshotId: 'c-1' }))).toEqual([]);
    store.dispatch({ type: 'switch_finished', vaultId: 'vault-b' });
    expect(store.getState().switchedTo).toBeNull();
    expect(store.advance(world({ activeVaultId: 'vault-c', snapshotId: 'c-1' }))).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
  });

  it('does not let a superseded switch with no target left pin a folder for later clicks', () => {
    const superseded = folderSwitchReducer(state({ target: target(), switching: 'vault-b' }), { type: 'abandoned' });
    expect(superseded).toMatchObject({ target: null, switching: 'vault-b', switchSuperseded: true });
    const settled = folderSwitchReducer(superseded, { type: 'switch_finished', vaultId: 'vault-b' });
    expect(settled).toEqual(initialFolderSwitchState);
  });

  it('starts a set pick afresh: a folder target from before it no longer counts', () => {
    const picked = folderSwitchReducer(state({ target: target() }), { type: 'set_picked', workspaceId: 'work', vaultId: 'vault-b' });
    expect(picked).toMatchObject({ target: null, setPick: { workspaceId: 'work', vaultId: 'vault-b' } });
  });
});

describe('planFolderSwitch', () => {
  it('does nothing without a target', () => {
    expect(planFolderSwitch(initialFolderSwitchState, world())).toEqual({ events: [], commands: [] });
  });

  it('switches to the target folder once, and not again while that switch runs', () => {
    const plan = planFolderSwitch(state({ target: target() }), world());
    expect(plan.commands).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
    expect(plan.events).toEqual([{ type: 'switch_started', vaultId: 'vault-b' }]);

    expect(planFolderSwitch(state({ target: target(), switching: 'vault-b' }), world()).commands).toEqual([]);
  });

  it('switches again when a later click asked for another folder while a switch ran (the last click wins)', () => {
    // The user clicked into B, then into C before B opened.
    const switchedToB = state({ target: target({ vaultId: 'vault-c' }), switchedTo: 'vault-b' });
    expect(planFolderSwitch(switchedToB, world()).commands).toEqual([{ type: 'switch_vault', vaultId: 'vault-c' }]);
  });

  it('does not switch again to a folder the last switch opened before the settings show it', () => {
    const plan = planFolderSwitch(state({ target: target(), switchedTo: 'vault-b' }), world());
    expect(plan.commands).toEqual([]);
  });

  it('forgets the folder it opened once the settings show it', () => {
    const plan = planFolderSwitch(state({ target: target(), switchedTo: 'vault-b' }), onB({ snapshotId: 'a-1' }));
    expect(plan.events).toContainEqual({ type: 'switch_seen' });
  });

  it('waits for a new snapshot: the tree of the folder the click came from does not count', () => {
    // Settings already say B is open, but the snapshot on screen is still the one asked from.
    expect(planFolderSwitch(state({ target: target() }), onB({ snapshotId: 'a-1' }))).toEqual({ events: [], commands: [] });
    expect(planFolderSwitch(state({ target: target() }), onB({ snapshotId: null }))).toEqual({ events: [], commands: [] });
  });

  it('waits until the folder is in the new tree, then shows it', () => {
    expect(planFolderSwitch(state({ target: target({ folderIds: ['archive'] }) }), onB()).commands).toEqual([]);

    const plan = planFolderSwitch(state({ target: target() }), onB());
    expect(plan.events).toEqual([{ type: 'arrived' }]);
    expect(plan.commands).toEqual([{ type: 'show_folder', folderIds: ['plans'] }]);
  });

  it('shows where a note lives once it is in the new tree; the note itself is already open', () => {
    const noteTarget = target({ kind: 'note', noteId: 'note-1' } as never);
    expect(planFolderSwitch(state({ target: { ...noteTarget, noteId: 'note-2' } as never }), onB()).commands).toEqual([]);
    expect(planFolderSwitch(state({ target: noteTarget }), onB()).commands).toEqual([{ type: 'show_folder', folderIds: ['plans'] }]);
  });

  it.each([
    ['create-note'], ['create-folder'], ['move'], ['edit'], ['delete'], ['reveal'],
  ] as const)('runs %s in the folder after showing it', (action) => {
    expect(planFolderSwitch(state({ target: target({ action } as never) }), onB()).commands).toEqual([
      { type: 'show_folder', folderIds: ['plans'] },
      { type: 'run_action', action, folderId: 'plans', name: undefined },
    ]);
  });

  it('renames only with a name', () => {
    expect(planFolderSwitch(state({ target: target({ action: 'rename', name: 'Ideas' } as never) }), onB()).commands).toContainEqual(
      { type: 'run_action', action: 'rename', folderId: 'plans', name: 'Ideas' },
    );
    expect(planFolderSwitch(state({ target: target({ action: 'rename' } as never) }), onB()).commands).toEqual([
      { type: 'show_folder', folderIds: ['plans'] },
    ]);
  });

  it('runs a top-level action in the folder once it opens, without selecting anything', () => {
    const root = target({ kind: 'root', action: 'create-note' } as never);
    expect(planFolderSwitch(state({ target: root }), onB()).commands).toEqual([{ type: 'run_action', action: 'create-note', folderId: null }]);
    const plainRoot = target({ kind: 'root' } as never);
    expect(planFolderSwitch(state({ target: plainRoot }), onB())).toEqual({ events: [{ type: 'arrived' }], commands: [] });
  });

  it('opens the folder picked in the switcher once its set is open with a snapshot', () => {
    const picked = state({ setPick: { workspaceId: 'work', vaultId: 'vault-b' } });
    // The set is still opening.
    expect(planFolderSwitch(picked, world({ activeSetId: null }))).toEqual({ events: [], commands: [] });
    expect(planFolderSwitch(picked, world({ snapshotId: null }))).toEqual({ events: [], commands: [] });

    const plan = planFolderSwitch(picked, world());
    expect(plan.events).toEqual([
      { type: 'set_opened' },
      { type: 'requested', target: { kind: 'root', vaultId: 'vault-b' }, snapshotId: 'a-1' },
      { type: 'switch_started', vaultId: 'vault-b' },
    ]);
    expect(plan.commands).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
  });

  it('does nothing more when the folder picked in the switcher is the one the set opened on', () => {
    const plan = planFolderSwitch(state({ setPick: { workspaceId: 'work', vaultId: 'vault-a' } }), world());
    expect(plan).toEqual({ events: [{ type: 'set_opened' }], commands: [] });
  });
});

describe('createFolderSwitchStore', () => {
  it('records a step before returning its commands, so running the driver again repeats nothing', () => {
    const store = createFolderSwitchStore();
    store.dispatch({ type: 'requested', target: { kind: 'folder', vaultId: 'vault-b', folderIds: ['plans'], action: 'rename', name: 'Ideas' }, snapshotId: 'a-1' });
    expect(store.advance(world())).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
    expect(store.advance(world())).toEqual([]);

    store.dispatch({ type: 'switch_finished', vaultId: 'vault-b' });
    expect(store.advance(onB())).toHaveLength(2);
    // The rename's own render can run the driver again before React shows the step.
    expect(store.advance(onB())).toEqual([]);
    expect(store.getState()).toEqual(initialFolderSwitchState);
  });

  it('notifies subscribers only when the state changes', () => {
    const store = createFolderSwitchStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls += 1; });
    store.dispatch({ type: 'switch_seen' });
    expect(calls).toBe(0);
    store.dispatch({ type: 'set_picked', workspaceId: 'work', vaultId: 'vault-b' });
    expect(calls).toBe(1);
    unsubscribe();
    store.dispatch({ type: 'set_pick_failed' });
    expect(calls).toBe(1);
  });
});
