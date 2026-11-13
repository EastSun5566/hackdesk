import type { WorkspaceScope } from './types';
import { DEFAULT_WORKSPACE_SCOPE } from './useWorkbenchWorkspaceState';

/**
 * How a window gets from launch to a workspace, as one state machine instead of flags, refs and
 * effects reacting to each other.
 *
 * Before anything is set up (no HackMD token and no local folder), or while drafts written then
 * are still waiting, the window works on unsaved drafts. Saving one asks where to save; once a
 * workspace exists the drafts move into it and the chosen one is saved. A window that starts on
 * a workspace resolves it once: the local folder preference on a fresh boot, or the folder or
 * named set a new window was opened onto.
 */
export type StartupState = {
  /** Drafts are the workspace: nothing was set up, or drafts from before setup still wait to move. */
  drafts: boolean;
  /** The draft the user asked to save while on drafts; saved once its workspace's tabs are live. */
  pendingSave: string | null;
  /** The editor was focused once on the drafts. */
  draftsFocused: boolean;
  /** The initial workspace was resolved; it happens once per window. */
  workspaceResolved: boolean;
};

export type StartupEvent =
  | { type: 'setup_missing' }
  | { type: 'drafts_focused' }
  | { type: 'save_requested'; tabId: string }
  | { type: 'save_cancelled' }
  | { type: 'drafts_moved' }
  | { type: 'draft_saved' }
  | { type: 'workspace_resolved' };

/** What the window knows when the plan runs. */
export type StartupWorld = {
  settings?: {
    hasToken: boolean;
    hasLocalVault: boolean;
    activeVaultId: string | null;
    /** Name shown for the active folder. */
    activeVaultLabel: string;
    vaultIds: string[];
    workspaceIds: string[];
    activeWorkspaceId: string | null;
  };
  /** The open local folder's session. */
  vault: { id: string | null; changing: boolean };
  scopeType: WorkspaceScope['type'];
  /** The workspace the window started on, and whether its URL chose it. */
  initialScope: WorkspaceScope;
  openedOntoScope: boolean;
  /** The workspace whose tabs are live, and the one the window shows; equal once a switch lands. */
  liveScopeKey: string | null;
  scopeKey: string | null;
  hasActiveTab: boolean;
};

export type StartupCommand =
  | { type: 'focus_editor' }
  | { type: 'move_drafts'; to: WorkspaceScope }
  | { type: 'open_scope'; scope: WorkspaceScope }
  | { type: 'switch_vault'; vaultId: string }
  | { type: 'activate_workspace'; workspaceId: string }
  | { type: 'save_draft'; tabId: string };

export function createStartupState(hasStoredDrafts: boolean): StartupState {
  return { drafts: hasStoredDrafts, pendingSave: null, draftsFocused: false, workspaceResolved: false };
}

export function startupReducer(state: StartupState, event: StartupEvent): StartupState {
  switch (event.type) {
    case 'setup_missing':
      return state.drafts ? state : { ...state, drafts: true };
    case 'drafts_focused':
      return state.draftsFocused ? state : { ...state, draftsFocused: true };
    case 'save_requested':
      return { ...state, pendingSave: event.tabId };
    case 'save_cancelled':
    case 'draft_saved':
      return state.pendingSave === null ? state : { ...state, pendingSave: null };
    case 'drafts_moved':
      return state.drafts ? { ...state, drafts: false } : state;
    case 'workspace_resolved':
      return state.workspaceResolved ? state : { ...state, workspaceResolved: true };
  }
}

function isSetupMissing(world: StartupWorld) {
  return world.settings !== undefined && !world.settings.hasToken && !world.settings.hasLocalVault;
}

/** Whether the window works on drafts now; false until the settings load. */
export function isOnDrafts(state: StartupState, settings: { hasToken: boolean; hasLocalVault: boolean } | undefined) {
  return settings !== undefined && (state.drafts || (!settings.hasToken && !settings.hasLocalVault));
}

/** Where the drafts go once a workspace exists: the open local folder, else HackMD. */
function draftsDestination(world: StartupWorld): WorkspaceScope | null {
  const settings = world.settings;
  if (!settings || world.vault.changing) return null;
  if (settings.hasLocalVault) {
    return world.vault.id ? { type: 'local', label: settings.activeVaultLabel, vaultId: world.vault.id } : null;
  }
  return settings.hasToken ? DEFAULT_WORKSPACE_SCOPE : null;
}

/** The commands that resolve the window's initial workspace. */
function resolveWorkspace(world: StartupWorld): StartupCommand[] {
  const settings = world.settings!;
  if (!settings.hasLocalVault) return [];
  const commands: StartupCommand[] = [];
  // A window opened onto an explicit workspace keeps it; the local preference is only for fresh boots.
  if (world.scopeType !== 'local' && world.initialScope.type === 'personal' && !world.openedOntoScope) {
    commands.push({ type: 'open_scope', scope: { type: 'local', label: settings.activeVaultLabel, vaultId: settings.activeVaultId ?? undefined } });
  }
  // A new window opened onto another folder or a named set opens it. Only a window URL names a
  // stored id; the saved last scope holds a snapshot id, which never equals a stored one.
  if (world.initialScope.type === 'local' && world.openedOntoScope && !world.vault.changing) {
    const { vaultId, workspaceId } = world.initialScope;
    if (vaultId && settings.vaultIds.includes(vaultId) && vaultId !== settings.activeVaultId) {
      commands.push({ type: 'switch_vault', vaultId });
    }
    if (workspaceId && settings.workspaceIds.includes(workspaceId) && workspaceId !== settings.activeWorkspaceId) {
      commands.push({ type: 'activate_workspace', workspaceId });
    }
  }
  return commands;
}

/**
 * The next steps from where startup stands: the events to record and the commands to run. Pure,
 * so every transition is a table test; the window runs it whenever what it reads changes.
 */
export function planStartup(state: StartupState, world: StartupWorld): { events: StartupEvent[]; commands: StartupCommand[] } {
  if (!world.settings) return { events: [], commands: [] };
  const events: StartupEvent[] = [];
  const commands: StartupCommand[] = [];
  if (isSetupMissing(world)) events.push({ type: 'setup_missing' });

  if (isOnDrafts(state, world.settings)) {
    if (world.hasActiveTab && !state.draftsFocused) {
      events.push({ type: 'drafts_focused' });
      commands.push({ type: 'focus_editor' });
    }
    // Once a workspace exists (set up just now, or before drafts were left), the drafts move in.
    const destination = draftsDestination(world);
    if (destination) commands.push({ type: 'move_drafts', to: destination });
    return { events, commands };
  }

  if (!state.workspaceResolved) {
    events.push({ type: 'workspace_resolved' });
    commands.push(...resolveWorkspace(world));
  }
  // The chosen draft is saved once the workspace it moved to has its tabs live.
  if (state.pendingSave && world.scopeKey && world.liveScopeKey === world.scopeKey) {
    events.push({ type: 'draft_saved' });
    commands.push({ type: 'save_draft', tabId: state.pendingSave });
  }
  return { events, commands };
}

export type StartupStore = {
  getState: () => StartupState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (event: StartupEvent) => void;
  /**
   * Plans from the current state, records the plan's events at once and returns its commands.
   * Recording before the commands run means a second call (React runs a new effect twice in
   * development) finds the steps already taken and repeats none of them.
   */
  advance: (world: StartupWorld) => StartupCommand[];
};

export function createStartupStore(initial: StartupState): StartupStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const dispatch = (event: StartupEvent) => {
    const next = startupReducer(state, event);
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
      const { events, commands } = planStartup(state, world);
      for (const event of events) dispatch(event);
      return commands;
    },
  };
}
