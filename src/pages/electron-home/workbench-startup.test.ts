import { describe, expect, it } from 'vitest';

import {
  createStartupState,
  createStartupStore,
  isOnDrafts,
  planStartup,
  startupReducer,
  type StartupState,
  type StartupWorld,
} from './workbench-startup';
import { DEFAULT_WORKSPACE_SCOPE } from './useWorkbenchWorkspaceState';

type Settings = NonNullable<StartupWorld['settings']>;

const NOTHING_SET_UP: Settings = {
  hasToken: false,
  hasLocalVault: false,
  activeVaultId: null,
  activeVaultLabel: 'Local Vault',
  vaultIds: [],
  workspaceIds: [],
  activeWorkspaceId: null,
};
const VAULT: Settings = { ...NOTHING_SET_UP, hasLocalVault: true, activeVaultId: 'vault-a', activeVaultLabel: 'Notes', vaultIds: ['vault-a', 'vault-b'], workspaceIds: ['work'] };
const HACKMD: Settings = { ...NOTHING_SET_UP, hasToken: true };

function world(overrides: Partial<StartupWorld> = {}): StartupWorld {
  return {
    settings: VAULT,
    vault: { id: 'snapshot-a', changing: false },
    scopeType: 'local',
    initialScope: { type: 'local', label: 'Notes' },
    openedOntoScope: false,
    liveScopeKey: 'local:snapshot-a',
    scopeKey: 'local:snapshot-a',
    hasActiveTab: true,
    ...overrides,
  };
}

const state = (overrides: Partial<StartupState> = {}): StartupState => ({ ...createStartupState(false), ...overrides });

describe('startupReducer', () => {
  it('records each step, and returns the same state when nothing changes', () => {
    const initial = createStartupState(false);
    const missing = startupReducer(initial, { type: 'setup_missing' });
    expect(missing.drafts).toBe(true);
    expect(startupReducer(missing, { type: 'setup_missing' })).toBe(missing);

    const requested = startupReducer(missing, { type: 'save_requested', tabId: 'tab-1' });
    expect(requested.pendingSave).toBe('tab-1');
    expect(startupReducer(requested, { type: 'save_cancelled' }).pendingSave).toBeNull();
    // Moving the drafts keeps the save the user asked for; it happens once the workspace is live.
    const moved = startupReducer(requested, { type: 'drafts_moved' });
    expect(moved).toMatchObject({ drafts: false, pendingSave: 'tab-1' });
    expect(startupReducer(moved, { type: 'draft_saved' }).pendingSave).toBeNull();
    expect(startupReducer(initial, { type: 'save_cancelled' })).toBe(initial);
  });

  it('starts on drafts when drafts from before setup are stored', () => {
    expect(createStartupState(true).drafts).toBe(true);
    expect(createStartupState(false).drafts).toBe(false);
  });
});

describe('isOnDrafts', () => {
  it.each([
    ['settings not loaded yet', state(), undefined, false],
    ['nothing set up', state(), NOTHING_SET_UP, true],
    ['a vault is set up', state(), VAULT, false],
    ['HackMD is set up', state(), HACKMD, false],
    ['drafts still wait to move, with a vault set up', state({ drafts: true }), VAULT, true],
  ] as const)('%s', (_label, current, settings, expected) => {
    expect(isOnDrafts(current, settings)).toBe(expected);
  });
});

describe('planStartup', () => {
  it('waits for the settings', () => {
    expect(planStartup(state(), world({ settings: undefined }))).toEqual({ events: [], commands: [] });
  });

  it('starts on drafts with nothing set up: remembers it and focuses the editor once', () => {
    const plan = planStartup(state(), world({ settings: NOTHING_SET_UP, vault: { id: null, changing: false } }));
    expect(plan.events).toEqual([{ type: 'setup_missing' }, { type: 'drafts_focused' }]);
    expect(plan.commands).toEqual([{ type: 'focus_editor' }]);

    const focused = state({ drafts: true, draftsFocused: true });
    expect(planStartup(focused, world({ settings: NOTHING_SET_UP, vault: { id: null, changing: false } })).commands).toEqual([]);
  });

  it('does not focus before the drafts have a tab', () => {
    const plan = planStartup(state(), world({ settings: NOTHING_SET_UP, hasActiveTab: false }));
    expect(plan.commands).toEqual([]);
  });

  it.each([
    ['a vault set up since', VAULT, { id: 'snapshot-a', changing: false }, [{ type: 'move_drafts', to: { type: 'local', label: 'Notes', vaultId: 'snapshot-a' } }]],
    ['HackMD set up since', HACKMD, { id: null, changing: false }, [{ type: 'move_drafts', to: DEFAULT_WORKSPACE_SCOPE }]],
    ['a vault that is still opening', VAULT, { id: 'snapshot-a', changing: true }, []],
    ['a vault whose folder has not loaded', VAULT, { id: null, changing: false }, []],
  ] as const)('moves waiting drafts into %s', (_label, settings, vault, commands) => {
    const plan = planStartup(state({ drafts: true, draftsFocused: true }), world({ settings, vault }));
    expect(plan.commands).toEqual(commands);
    // While on drafts, the initial workspace is not resolved yet.
    expect(plan.events).not.toContainEqual({ type: 'workspace_resolved' });
  });

  it('resolves the initial workspace once: a fresh boot opens the local folder', () => {
    const plan = planStartup(state(), world({ scopeType: 'personal', initialScope: DEFAULT_WORKSPACE_SCOPE }));
    expect(plan.events).toEqual([{ type: 'workspace_resolved' }]);
    expect(plan.commands).toEqual([{ type: 'open_scope', scope: { type: 'local', label: 'Notes', vaultId: 'vault-a' } }]);
    expect(planStartup(state({ workspaceResolved: true }), world({ scopeType: 'personal', initialScope: DEFAULT_WORKSPACE_SCOPE })).commands).toEqual([]);
  });

  it.each([
    ['without a local folder', { settings: HACKMD, scopeType: 'personal', initialScope: DEFAULT_WORKSPACE_SCOPE }],
    ['on a team the last session left', { scopeType: 'team', initialScope: { type: 'team', label: 'Atlas', teamPath: 'atlas' } }],
    ['already on the local folder', { scopeType: 'local' }],
    ['when the window was opened onto My Workspace', { scopeType: 'personal', initialScope: DEFAULT_WORKSPACE_SCOPE, openedOntoScope: true }],
  ] as const)('keeps the workspace %s', (_label, overrides) => {
    const plan = planStartup(state(), world(overrides as Partial<StartupWorld>));
    expect(plan.events).toEqual([{ type: 'workspace_resolved' }]);
    expect(plan.commands).toEqual([]);
  });

  it('opens the folder and named set a new window was opened onto', () => {
    const opened = world({ openedOntoScope: true, initialScope: { type: 'local', label: 'B', vaultId: 'vault-b', workspaceId: 'work' } });
    expect(planStartup(state(), opened).commands).toEqual([
      { type: 'switch_vault', vaultId: 'vault-b' },
      { type: 'activate_workspace', workspaceId: 'work' },
    ]);
    // Unknown ids (another install's, or a snapshot id) and the already open ones are left alone.
    const known = world({ openedOntoScope: true, initialScope: { type: 'local', label: 'A', vaultId: 'vault-a', workspaceId: 'gone' } });
    expect(planStartup(state(), known).commands).toEqual([]);
    // A folder still opening is not switched again.
    expect(planStartup(state(), { ...opened, vault: { id: 'snapshot-a', changing: true } }).commands).toEqual([]);
  });

  it('saves the chosen draft once its workspace has its tabs live', () => {
    const moved = state({ pendingSave: 'tab-1', workspaceResolved: true });
    expect(planStartup(moved, world({ liveScopeKey: 'initial-drafts', scopeKey: 'local:snapshot-a' })).commands).toEqual([]);
    const plan = planStartup(moved, world());
    expect(plan.events).toEqual([{ type: 'draft_saved' }]);
    expect(plan.commands).toEqual([{ type: 'save_draft', tabId: 'tab-1' }]);
    // Still on drafts, nothing is saved.
    expect(planStartup({ ...moved, drafts: true, draftsFocused: true }, world({ vault: { id: null, changing: false } })).commands).toEqual([]);
  });
});

describe('createStartupStore', () => {
  it('records a plan before returning its commands, so running it twice repeats nothing', () => {
    const store = createStartupStore(state({ pendingSave: 'tab-1' }));
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    const opened = world({ scopeType: 'personal', initialScope: DEFAULT_WORKSPACE_SCOPE });

    expect(store.advance(opened)).toEqual([
      { type: 'open_scope', scope: { type: 'local', label: 'Notes', vaultId: 'vault-a' } },
      { type: 'save_draft', tabId: 'tab-1' },
    ]);
    // React runs a new effect twice in development; the second run finds the steps taken.
    expect(store.advance(opened)).toEqual([]);
    expect(store.getState()).toMatchObject({ workspaceResolved: true, pendingSave: null });
    expect(notified).toBe(2);
  });
});
