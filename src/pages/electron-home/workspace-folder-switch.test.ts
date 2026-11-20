import { describe, expect, it } from 'vitest';

import {
  createFolderSwitchStore,
  folderSwitchReducer,
  initialFolderSwitchState,
  planFolderSwitch,
  type FolderSwitchState,
  type FolderSwitchTarget,
  type FolderSwitchWorld,
} from './workspace-folder-switch';

// Named set "work" = {A, B, C}; A (snapshot a-1) is open. B has a Plans folder and a note in it.
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

const FROM_A = { snapshotId: 'a-1', vaultId: 'vault-a', setId: 'work' };
const PLANS: FolderSwitchTarget = { kind: 'folder', vaultId: 'vault-b', folderIds: ['plans'] };

/** The state right after a click asked for this target from A. */
const asked = (target: FolderSwitchTarget = PLANS, overrides: Partial<FolderSwitchState> = {}): FolderSwitchState => ({
  ...folderSwitchReducer(initialFolderSwitchState, { type: 'requested', target, origin: FROM_A }),
  ...overrides,
});

describe('folderSwitchReducer', () => {
  it('records each step, and returns the same state when nothing changes', () => {
    const requested = asked({ kind: 'note', vaultId: 'vault-b', noteId: 'note-1' });
    expect(requested.target).toEqual({ kind: 'note', vaultId: 'vault-b', noteId: 'note-1', originSnapshotId: 'a-1', originSetId: 'work' });
    expect(requested.knownVaultIds).toEqual(['vault-a']);

    const switching = folderSwitchReducer(requested, { type: 'switch_started', vaultId: 'vault-b' });
    expect(switching).toMatchObject({ switching: 'vault-b', knownVaultIds: ['vault-a', 'vault-b'] });
    const switched = folderSwitchReducer(switching, { type: 'switch_finished' });
    expect(switched.switching).toBeNull();
    expect(folderSwitchReducer(switched, { type: 'arrived' })).toMatchObject({ target: null, knownVaultIds: [] });

    // A failed switch drops the target: nothing happens later when another switch lands there.
    expect(folderSwitchReducer(switching, { type: 'switch_failed' })).toEqual(initialFolderSwitchState);
    expect(folderSwitchReducer(initialFolderSwitchState, { type: 'set_opened' })).toBe(initialFolderSwitchState);
    expect(folderSwitchReducer(initialFolderSwitchState, { type: 'switch_finished' })).toBe(initialFolderSwitchState);
  });

  it('keeps every folder of a chain of clicks as known, and starts afresh after the target is done', () => {
    const switchingToB = folderSwitchReducer(asked(), { type: 'switch_started', vaultId: 'vault-b' });
    // The settings show B already (the switch sets them first) when C's row is clicked.
    const toC = folderSwitchReducer(switchingToB, {
      type: 'requested', target: { kind: 'root', vaultId: 'vault-c' }, origin: { snapshotId: 'a-1', vaultId: 'vault-b', setId: 'work' },
    });
    expect(toC.knownVaultIds).toEqual(['vault-a', 'vault-b']);

    const fresh = folderSwitchReducer(initialFolderSwitchState, {
      type: 'requested', target: PLANS, origin: { snapshotId: 'c-1', vaultId: 'vault-c', setId: 'work' },
    });
    expect(fresh.knownVaultIds).toEqual(['vault-c']);
  });

  it('abandons the target and a set pick, and a set pick starts afresh', () => {
    const waiting = { ...asked(), setPick: { workspaceId: 'other', vaultId: 'vault-x' } };
    expect(folderSwitchReducer(waiting, { type: 'abandoned' })).toEqual(initialFolderSwitchState);
    expect(folderSwitchReducer(initialFolderSwitchState, { type: 'abandoned' })).toBe(initialFolderSwitchState);

    const picked = folderSwitchReducer(asked(), { type: 'set_picked', workspaceId: 'work', vaultId: 'vault-b' });
    expect(picked).toMatchObject({ target: null, setPick: { workspaceId: 'work', vaultId: 'vault-b' } });
  });
});

describe('planFolderSwitch', () => {
  it('does nothing without a target', () => {
    expect(planFolderSwitch(initialFolderSwitchState, world())).toEqual({ events: [], commands: [] });
  });

  it('switches to the target folder once, and not again while that switch runs', () => {
    const plan = planFolderSwitch(asked(), world());
    expect(plan.commands).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
    expect(plan.events).toEqual([{ type: 'switch_started', vaultId: 'vault-b' }]);

    expect(planFolderSwitch(asked(PLANS, { switching: 'vault-b', knownVaultIds: ['vault-a', 'vault-b'] }), world()).commands).toEqual([]);
  });

  it('switches again when a later click asked for another folder while a switch ran (the last click wins)', () => {
    // The user clicked into B, then into C before B's tree arrived.
    const toC = asked({ kind: 'root', vaultId: 'vault-c' }, { knownVaultIds: ['vault-a', 'vault-b'] });
    expect(planFolderSwitch(toC, onB()).commands).toEqual([{ type: 'switch_vault', vaultId: 'vault-c' }]);
  });

  it('compares with the settings as they are, so a re-click after any switch switches again', () => {
    // Whatever happened before, the settings say A is open and B is wanted: B is switched to.
    expect(planFolderSwitch(asked(), world()).commands).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
  });

  it('waits for a new snapshot: the tree of the folder the click came from does not count', () => {
    // Settings already say B is open, but the snapshot on screen is still the one asked from.
    expect(planFolderSwitch(asked(), onB({ snapshotId: 'a-1' }))).toEqual({ events: [], commands: [] });
    expect(planFolderSwitch(asked(), onB({ snapshotId: null }))).toEqual({ events: [], commands: [] });
  });

  it('waits until the folder is in the new tree, then shows it', () => {
    expect(planFolderSwitch(asked({ ...PLANS, folderIds: ['archive'] }), onB()).commands).toEqual([]);

    const plan = planFolderSwitch(asked(), onB());
    expect(plan.events).toEqual([{ type: 'arrived' }]);
    expect(plan.commands).toEqual([{ type: 'show_folder', folderIds: ['plans'] }]);
  });

  it('shows where a note lives once it is in the new tree; the note itself is already open', () => {
    expect(planFolderSwitch(asked({ kind: 'note', vaultId: 'vault-b', noteId: 'note-2' }), onB()).commands).toEqual([]);
    expect(planFolderSwitch(asked({ kind: 'note', vaultId: 'vault-b', noteId: 'note-1' }), onB()).commands)
      .toEqual([{ type: 'show_folder', folderIds: ['plans'] }]);
  });

  it.each([
    ['create-note'], ['create-folder'], ['move'], ['edit'], ['delete'], ['reveal'],
  ] as const)('runs %s in the folder after showing it', (action) => {
    expect(planFolderSwitch(asked({ ...PLANS, action }), onB()).commands).toEqual([
      { type: 'show_folder', folderIds: ['plans'] },
      { type: 'run_action', action, folderId: 'plans', name: undefined },
    ]);
  });

  it('renames only with a name', () => {
    expect(planFolderSwitch(asked({ ...PLANS, action: 'rename', name: 'Ideas' }), onB()).commands).toContainEqual(
      { type: 'run_action', action: 'rename', folderId: 'plans', name: 'Ideas' },
    );
    expect(planFolderSwitch(asked({ ...PLANS, action: 'rename' }), onB()).commands).toEqual([
      { type: 'show_folder', folderIds: ['plans'] },
    ]);
  });

  it('runs a top-level action in the folder once it opens, without selecting anything', () => {
    expect(planFolderSwitch(asked({ kind: 'root', vaultId: 'vault-b', action: 'create-note' }), onB()).commands)
      .toEqual([{ type: 'run_action', action: 'create-note', folderId: null }]);
    expect(planFolderSwitch(asked({ kind: 'root', vaultId: 'vault-b' }), onB())).toEqual({ events: [{ type: 'arrived' }], commands: [] });
  });

  it('opens the folder picked in the switcher once its set is open with a snapshot', () => {
    const picked = { ...initialFolderSwitchState, setPick: { workspaceId: 'work', vaultId: 'vault-b' } };
    // The set is still opening.
    expect(planFolderSwitch(picked, world({ activeSetId: null }))).toEqual({ events: [], commands: [] });
    expect(planFolderSwitch(picked, world({ snapshotId: null }))).toEqual({ events: [], commands: [] });

    const plan = planFolderSwitch(picked, world());
    expect(plan.events).toEqual([
      { type: 'set_opened' },
      { type: 'requested', target: { kind: 'root', vaultId: 'vault-b' }, origin: FROM_A },
      { type: 'switch_started', vaultId: 'vault-b' },
    ]);
    expect(plan.commands).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
  });

  it('does nothing more when the folder picked in the switcher is the one the set opened on', () => {
    const plan = planFolderSwitch({ ...initialFolderSwitchState, setPick: { workspaceId: 'work', vaultId: 'vault-a' } }, world());
    expect(plan).toEqual({ events: [{ type: 'set_opened' }], commands: [] });
  });
});

describe('another path moving the window', () => {
  it('abandons the target when a folder it never saw or caused opens (#432 review)', () => {
    // A row of B was clicked; then Settings > Add vault, the folder list or the palette opened N.
    const switching = asked(PLANS, { switching: 'vault-b', knownVaultIds: ['vault-a', 'vault-b'] });
    expect(planFolderSwitch(switching, world({ activeVaultId: 'vault-n', snapshotId: 'n-1' }))).toEqual({
      events: [{ type: 'abandoned' }],
      commands: [],
    });
  });

  it('abandons the target when the window leaves the set', () => {
    expect(planFolderSwitch(asked(), world({ activeSetId: null })).events).toEqual([{ type: 'abandoned' }]);
    expect(planFolderSwitch(asked(), world({ activeSetId: 'other' })).events).toEqual([{ type: 'abandoned' }]);
  });

  it('never counts the folder the click came from, a running switch, or the target folder as elsewhere', () => {
    // Settings briefly show A again while B's switch runs (a settings read replaced the optimistic id).
    expect(planFolderSwitch(asked(PLANS, { switching: 'vault-b', knownVaultIds: ['vault-a', 'vault-b'] }), world()).events).toEqual([]);
    // B opened by another path is where the target wanted to go anyway.
    expect(planFolderSwitch(asked(), onB()).events).toEqual([{ type: 'arrived' }]);
  });

  it('lets a re-click switch again after another path superseded the switch (#432 review)', () => {
    // A row of B starts a switch to B; N is opened meanwhile, and B's switch settles under it.
    const store = createFolderSwitchStore();
    store.dispatch({ type: 'requested', target: PLANS, origin: FROM_A });
    expect(store.advance(world())).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
    expect(store.advance(world({ activeVaultId: 'vault-n', snapshotId: 'n-1' }))).toEqual([]);
    store.dispatch({ type: 'switch_finished' });
    expect(store.getState()).toEqual(initialFolderSwitchState);

    // Clicking B's row again from N switches to B, and B's tree then shows Plans.
    store.dispatch({ type: 'requested', target: PLANS, origin: { snapshotId: 'n-1', vaultId: 'vault-n', setId: 'work' } });
    const fromN = world({ activeVaultId: 'vault-n', snapshotId: 'n-1' });
    expect(store.advance(fromN)).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
    store.dispatch({ type: 'switch_finished' });
    expect(store.advance(onB())).toEqual([{ type: 'show_folder', folderIds: ['plans'] }]);
  });
});

describe('createFolderSwitchStore', () => {
  it('records a step before returning its commands, so running the driver again repeats nothing', () => {
    const store = createFolderSwitchStore();
    store.dispatch({ type: 'requested', target: { ...PLANS, action: 'rename', name: 'Ideas' }, origin: FROM_A });
    expect(store.advance(world())).toEqual([{ type: 'switch_vault', vaultId: 'vault-b' }]);
    expect(store.advance(world())).toEqual([]);

    store.dispatch({ type: 'switch_finished' });
    expect(store.advance(onB())).toHaveLength(2);
    // The rename's own render can run the driver again before React shows the step.
    expect(store.advance(onB())).toEqual([]);
    expect(store.getState()).toEqual(initialFolderSwitchState);
  });

  it('notifies subscribers only when the state changes', () => {
    const store = createFolderSwitchStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls += 1; });
    store.dispatch({ type: 'switch_finished' });
    expect(calls).toBe(0);
    store.dispatch({ type: 'set_picked', workspaceId: 'work', vaultId: 'vault-b' });
    expect(calls).toBe(1);
    unsubscribe();
    store.dispatch({ type: 'set_pick_failed' });
    expect(calls).toBe(1);
  });
});
