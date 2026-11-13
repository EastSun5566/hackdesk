import { z } from 'zod';

import { DEFAULT_TITLE } from '@/constants';
import {
  AI_PROVIDER_IDS,
  MAX_AI_COMMAND_NAME_CHARACTERS,
  MAX_AI_COMMAND_PROMPT_CHARACTERS,
  MAX_AI_CUSTOM_COMMANDS,
  type AiDelivery,
  type AiProviderId,
} from '@/lib/ai';
import { APP_ICON_IDS, DEFAULT_APP_ICON } from '@/lib/app-icons';
import { MAX_DICTATION_LOCALE_LENGTH } from '@/lib/dictation';
import { ELECTRON_ACTIONS } from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';
import { isValidCustomShortcutConfig } from '@/lib/keyboard-shortcuts';
import { DEFAULT_QUICK_CAPTURE_PIN_SHORTCUT, isValidQuickCapturePinShortcut } from '@/lib/quick-capture-shortcuts';
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  MAX_EDITOR_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  defaultThemeTypography,
  isSafeFontStack,
  normalizeThemeMode,
  normalizeThemePresetId,
  normalizeThemeSeed,
  normalizeThemeTypography,
  type ThemeMode,
  type ThemePresetId,
  type ThemeSeed,
  type ThemeTypography,
} from '@/lib/themes';

export type AppearanceSettings = {
  theme: ThemeMode;
  presetId: ThemePresetId;
  customSeed: Partial<ThemeSeed>;
  typography: ThemeTypography;
};

export type OnboardingSettings = {
  hackmdTokenSetupDeferred: boolean;
};

export type LocalVaultEntry = {
  id: string;
  path: string;
};

/** A named working set: the folders one Local workspace shows as its roots. */
export type LocalWorkspaceEntry = {
  id: string;
  name: string;
  vaultIds: string[];
};

export type LocalVaultSettings = {
  vaults: LocalVaultEntry[];
  activeVaultId: string | null;
  /** Named working sets of vault folders; empty keeps the single-vault behavior. */
  workspaces: LocalWorkspaceEntry[];
  activeWorkspaceId: string | null;
};

export type HackmdAccountEntry = {
  id: string;
  label: string;
};

export type HackmdAccountsSettings = {
  accounts: HackmdAccountEntry[];
  activeAccountId: string | null;
};

export type EditorMode = 'standard' | 'emacs' | 'vim' | 'helix' | 'kakoune';

export type EditorSettings = {
  mode: EditorMode;
};

export type ShortcutSettings = Partial<Record<ElectronActionId, string>>;

export type KeyboardNavigationSettings = {
  characterShortcutsEnabled: boolean;
  /** The line of keys for where focus is, at the bottom of the window. */
  keyHintsVisible: boolean;
};

export type WorkspaceNavigationSettings = {
  pinnedTeamIds: string[] | null;
};

export type AiProviderSettings = {
  /** Off until the user turns it on: the switch is the user's grant to run that CLI. */
  enabled: boolean;
  model: string | null;
  commandPath: string | null;
  /** Claude only: run without ANTHROPIC_API_KEY so the claude.ai sign-in is used. */
  ignoreApiKey: boolean;
};

/** A prompt saved under a name, offered in the ⌘K menu. */
export type AiCustomCommand = {
  id: string;
  name: string;
  prompt: string;
  delivery: AiDelivery;
};

export type AiSettings = {
  providers: Record<AiProviderId, AiProviderSettings>;
  defaultProvider: AiProviderId | null;
  /** Shows the "✦ AI" button after selecting text with the mouse. */
  selectionChip: boolean;
  translateLanguage: string;
  customCommands: AiCustomCommand[];
};

export type DictationSettings = {
  /** Off until the user turns it on in Settings, which is their consent to microphone use. */
  enabled: boolean;
  /** A BCP 47 tag such as zh-TW, or null to follow the system's preferred languages. */
  locale: string | null;
};

export type OfflineSettings = {
  /** Keeps opened HackMD notes on this computer for offline reading and text search. */
  keepHackmdNotes: boolean;
};

export const defaultAppearanceSettings: AppearanceSettings = {
  theme: 'system',
  presetId: 'hackmd-neo',
  customSeed: {},
  typography: defaultThemeTypography,
};

export const defaultOnboardingSettings: OnboardingSettings = {
  hackmdTokenSetupDeferred: false,
};

export const defaultLocalVaultSettings: LocalVaultSettings = {
  vaults: [],
  activeVaultId: null,
  workspaces: [],
  activeWorkspaceId: null,
};

export const defaultHackmdAccountsSettings: HackmdAccountsSettings = {
  accounts: [],
  activeAccountId: null,
};

export const defaultEditorSettings: EditorSettings = {
  mode: 'standard',
};

export const defaultShortcutSettings: ShortcutSettings = {};

export const defaultWorkspaceNavigationSettings: WorkspaceNavigationSettings = {
  pinnedTeamIds: null,
};

const defaultAiProviderSettings: AiProviderSettings = { enabled: false, model: null, commandPath: null, ignoreApiKey: false };

export const defaultAiSettings: AiSettings = {
  providers: { codex: defaultAiProviderSettings, claude: defaultAiProviderSettings },
  defaultProvider: null,
  selectionChip: true,
  translateLanguage: 'English',
  customCommands: [],
};

export type QuickCaptureSettings = {
  /** Starts Quick Hack pinned: the popup stays open after a capture for the next one. */
  keepOpen: boolean;
  /** Pins or unpins the open popup; `none` turns the shortcut off. */
  pinShortcut: string;
};

export const defaultQuickCaptureSettings: QuickCaptureSettings = {
  keepOpen: false,
  pinShortcut: DEFAULT_QUICK_CAPTURE_PIN_SHORTCUT,
};

export const defaultOfflineSettings: OfflineSettings = {
  keepHackmdNotes: true,
};

export const defaultDictationSettings: DictationSettings = {
  enabled: false,
  locale: null,
};

const hexColorSchema = z.string().regex(/^#[\da-fA-F]{6}$/);
const hackmdAccountsSettingsSchema = z.unknown().default(defaultHackmdAccountsSettings).transform(
  (value): HackmdAccountsSettings => normalizeHackmdAccountsSettings(value),
);
const localVaultSettingsSchema = z.unknown().default(defaultLocalVaultSettings).transform(
  (value): LocalVaultSettings => normalizeLocalVaultSettings(value),
);

/** Stable per-account identity, so switching never confuses one token for another. */
export function createHackmdAccountId() {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  } catch {
    // Fall through to the Math.random fallback below.
  }
  return `account-${Date.now().toString(36)}-${Math.floor(Math.random() * 2 ** 32).toString(36)}`;
}

const MAX_HACKMD_ACCOUNTS = 10;

function normalizeAccountLabel(label: unknown) {
  if (typeof label !== 'string') {
    return '';
  }
  const trimmed = label.trim();
  return trimmed.length <= 200 ? trimmed : '';
}

/**
 * Normalizes any stored value into an account list. Never throws: garbage becomes empty.
 * Unknown active ids fall back to the first account.
 */
export function normalizeHackmdAccountsSettings(value: unknown): HackmdAccountsSettings {
  const source = (value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null) ?? {};

  const seenIds = new Set<string>();
  const accounts: HackmdAccountEntry[] = [];
  if (Array.isArray(source.accounts)) {
    for (const raw of source.accounts) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        continue;
      }
      const rawId = (raw as Record<string, unknown>).id;
      const id = typeof rawId === 'string' && rawId.trim().length > 0 && rawId.trim().length <= 200
        ? rawId.trim()
        : createHackmdAccountId();
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
      accounts.push({ id, label: normalizeAccountLabel((raw as Record<string, unknown>).label) });
      if (accounts.length >= MAX_HACKMD_ACCOUNTS) {
        break;
      }
    }
  }

  if (accounts.length === 0) {
    return { accounts: [], activeAccountId: null };
  }

  const rawActive = typeof source.activeAccountId === 'string' ? source.activeAccountId.trim() : null;
  const activeAccountId = rawActive && seenIds.has(rawActive) ? rawActive : accounts[0].id;
  return { accounts, activeAccountId };
}

export function getActiveHackmdAccount(
  settings: Pick<AppSettings, 'hackmdAccounts'> | undefined,
): HackmdAccountEntry | null {
  if (!settings) {
    return null;
  }
  const active = settings.hackmdAccounts.accounts.find((account) => account.id === settings.hackmdAccounts.activeAccountId);
  return active ?? settings.hackmdAccounts.accounts[0] ?? null;
}

/** Adds an account and activates it; blank labels stay blank until a username names them. */
export function addHackmdAccount(
  current: HackmdAccountsSettings,
  label: string,
): HackmdAccountsSettings {
  if (current.accounts.length >= MAX_HACKMD_ACCOUNTS) throw new Error('Account limit reached. Remove an account before adding another.');
  const entry = { id: createHackmdAccountId(), label: normalizeAccountLabel(label) };
  return { accounts: [...current.accounts, entry], activeAccountId: entry.id };
}

export function setActiveHackmdAccount(
  current: HackmdAccountsSettings,
  id: string,
): HackmdAccountsSettings {
  if (!current.accounts.some((account) => account.id === id)) {
    return current;
  }
  return { accounts: current.accounts, activeAccountId: id };
}

/** Forgets an account; the first remaining one becomes active when it was the active one. */
export function removeHackmdAccount(
  current: HackmdAccountsSettings,
  id: string,
): HackmdAccountsSettings {
  const accounts = current.accounts.filter((account) => account.id !== id);
  if (accounts.length === current.accounts.length) {
    return current;
  }
  if (accounts.length === 0) {
    return { accounts: [], activeAccountId: null };
  }
  const activeAccountId = current.activeAccountId === id ? accounts[0].id : current.activeAccountId;
  return {
    accounts,
    activeAccountId: activeAccountId && accounts.some((account) => account.id === activeAccountId) ? activeAccountId : accounts[0].id,
  };
}
/** Stable per-vault identity, so renames and moves keep referring to the same vault. */
export function createLocalVaultId() {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  } catch {
    // Fall through to the Math.random fallback below.
  }
  return `vault-${Date.now().toString(36)}-${Math.floor(Math.random() * 2 ** 32).toString(36)}`;
}

function normalizeVaultPath(path: unknown) {
  if (typeof path !== 'string') {
    return null;
  }
  const trimmed = path.trim();
  return trimmed.length > 0 && trimmed.length <= 4096 ? trimmed : null;
}

/**
 * Normalizes any stored value into a vault list, migrating the legacy single-path shape
 * (`{ path }`) into one active vault. Never throws: garbage becomes the fallback.
 */
export function normalizeLocalVaultSettings(value: unknown): LocalVaultSettings {
  const source = (value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null) ?? {};
  // Legacy shape from before multi-vault support.
  const legacyPath = 'path' in source && !('vaults' in source) ? normalizeVaultPath(source.path) : null;

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const vaults: LocalVaultEntry[] = [];
  const rawVaults = legacyPath !== null ? [{ id: createLocalVaultId(), path: legacyPath }] : source.vaults;
  if (Array.isArray(rawVaults)) {
    for (const raw of rawVaults) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        continue;
      }
      const path = normalizeVaultPath((raw as Record<string, unknown>).path);
      const rawId = (raw as Record<string, unknown>).id;
      const id = typeof rawId === 'string' && rawId.trim().length > 0 && rawId.trim().length <= 200
        ? rawId.trim()
        : createLocalVaultId();
      if (!path || seenIds.has(id)) {
        continue;
      }
      // The same folder opened twice is one vault; the first entry wins.
      if (seenPaths.has(path)) {
        continue;
      }
      seenIds.add(id);
      seenPaths.add(path);
      vaults.push({ id, path });
      if (vaults.length >= 32) {
        break;
      }
    }
  }

  if (vaults.length === 0) {
    return { vaults: [], activeVaultId: null, workspaces: [], activeWorkspaceId: null };
  }

  const rawActive = typeof source.activeVaultId === 'string' ? source.activeVaultId.trim() : null;
  const activeVaultId = rawActive && seenIds.has(rawActive) ? rawActive : vaults[0].id;
  const { workspaces, activeWorkspaceId } = normalizeLocalWorkspaces(source, seenIds);
  return { vaults, activeVaultId, workspaces, activeWorkspaceId };
}

const MAX_LOCAL_WORKSPACES = 32;

function normalizeWorkspaceName(name: unknown) {
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

/** Keeps only known vault ids, in order, without duplicates, capped so a damaged file stays bounded. */
function normalizeWorkspaceVaultIds(value: unknown, knownVaultIds: Set<string>) {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      continue;
    }
    const id = raw.trim();
    if (!knownVaultIds.has(id) || ids.includes(id)) {
      continue;
    }
    ids.push(id);
    if (ids.length >= 32) {
      break;
    }
  }
  return ids;
}

/**
 * Workspaces name a working set of known vault folders. A workspace that lost all its folders is
 * dropped, and an active id that no longer exists falls back to no workspace (single-vault mode).
 */
function normalizeLocalWorkspaces(source: Record<string, unknown>, knownVaultIds: Set<string>) {
  const seen = new Set<string>();
  const workspaces: LocalWorkspaceEntry[] = [];
  if (Array.isArray(source.workspaces)) {
    for (const raw of source.workspaces) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        continue;
      }
      const entry = raw as Record<string, unknown>;
      const vaultIds = normalizeWorkspaceVaultIds(entry.vaultIds, knownVaultIds);
      if (vaultIds.length === 0) {
        continue;
      }
      const rawId = entry.id;
      const id = typeof rawId === 'string' && rawId.trim().length > 0 && rawId.trim().length <= 200
        ? rawId.trim()
        : createLocalWorkspaceId();
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      workspaces.push({ id, name: normalizeWorkspaceName(entry.name) ?? 'Local workspace', vaultIds });
      if (workspaces.length >= MAX_LOCAL_WORKSPACES) {
        break;
      }
    }
  }

  const rawActive = typeof source.activeWorkspaceId === 'string' ? source.activeWorkspaceId.trim() : null;
  const activeWorkspaceId = rawActive && seen.has(rawActive) ? rawActive : null;
  return { workspaces, activeWorkspaceId };
}

/** Stable per-workspace identity, so renaming and reordering keep the same working set. */
export function createLocalWorkspaceId() {
  return createLocalVaultId().replace(/^vault-/, 'workspace-');
}

/**
 * Settings shaped by an older main process may carry only part of the local-vault section during a
 * renderer reload, so every read treats a missing list as empty instead of trusting the type.
 */
type LocalVaultLike = { localVault?: Partial<LocalVaultSettings> } | undefined;

function localVaultVaults(settings: LocalVaultLike): LocalVaultEntry[] {
  const vaults = settings?.localVault?.vaults;
  return Array.isArray(vaults) ? vaults : [];
}

function localWorkspaceEntries(localVault: Partial<LocalVaultSettings> | undefined): LocalWorkspaceEntry[] {
  const workspaces = localVault?.workspaces;
  return Array.isArray(workspaces) ? workspaces : [];
}

/** The stored folders, tolerating an older main process that does not send them. */
export function getLocalVaults(settings: LocalVaultLike): LocalVaultEntry[] {
  return localVaultVaults(settings);
}

/** The named working sets, tolerating an older main process that does not send them. */
export function getLocalWorkspaces(settings: LocalVaultLike): LocalWorkspaceEntry[] {
  return localWorkspaceEntries(settings?.localVault);
}

export function getActiveLocalVault(
  settings: LocalVaultLike,
): LocalVaultEntry | null {
  const vaults = localVaultVaults(settings);
  const active = vaults.find((vault) => vault.id === settings?.localVault?.activeVaultId);
  return active ?? vaults[0] ?? null;
}

export function getActiveLocalVaultPath(
  settings: LocalVaultLike,
): string | null {
  return getActiveLocalVault(settings)?.path ?? null;
}

/** The named working set the sidebar groups folders under, when one is active. */
export function getActiveLocalWorkspace(
  settings: LocalVaultLike,
): LocalWorkspaceEntry | null {
  const workspaces = getLocalWorkspaces(settings);
  return workspaces.find((workspace) => workspace.id === settings?.localVault?.activeWorkspaceId) ?? null;
}

/** The vault folders an active workspace shows as roots, active vault included. */
export function getLocalWorkspaceVaults(
  settings: LocalVaultLike,
): LocalVaultEntry[] {
  const workspace = getActiveLocalWorkspace(settings);
  if (!workspace) {
    return [];
  }
  return workspace.vaultIds
    .map((id) => localVaultVaults(settings).find((vault) => vault.id === id))
    .filter((vault): vault is LocalVaultEntry => Boolean(vault));
}

/** Adds a folder as a vault and activates it; re-adding an existing folder just activates it. */
export function addLocalVault(
  current: LocalVaultSettings,
  path: string,
): LocalVaultSettings {
  const trimmed = path.trim();
  if (!trimmed) {
    return current;
  }
  const existing = current.vaults.find((vault) => vault.path === trimmed);
  if (existing) {
    return { ...current, activeVaultId: existing.id };
  }
  if (current.vaults.length >= 32) throw new Error('Folder limit reached. Remove a folder before adding another.');
  const activeWorkspace = localWorkspaceEntries(current).find((workspace) => workspace.id === current.activeWorkspaceId);
  if (activeWorkspace && activeWorkspace.vaultIds.length >= 32) throw new Error('This workspace has reached its folder limit.');
  const entry = { id: createLocalVaultId(), path: trimmed };
  const vaults = [...current.vaults, entry];
  // Adding a folder while a workspace is open extends that working set.
  const existingWorkspaces = localWorkspaceEntries(current);
  const workspaces = current.activeWorkspaceId
    ? existingWorkspaces.map((workspace) => (
      workspace.id === current.activeWorkspaceId
        ? { ...workspace, vaultIds: [...workspace.vaultIds, entry.id] }
        : workspace
    ))
    : existingWorkspaces;
  return { ...current, vaults, workspaces, activeVaultId: entry.id };
}

export function setActiveLocalVault(
  current: LocalVaultSettings,
  id: string,
): LocalVaultSettings {
  if (!current.vaults.some((vault) => vault.id === id)) {
    return current;
  }
  return { ...current, activeVaultId: id };
}

/** Forgets a vault; activating the first remaining one keeps a vault open when possible. */
export function removeLocalVault(
  current: LocalVaultSettings,
  id: string,
): LocalVaultSettings {
  const vaults = current.vaults.filter((vault) => vault.id !== id);
  if (vaults.length === current.vaults.length) {
    return current;
  }
  if (vaults.length === 0) {
    return { ...current, vaults: [], activeVaultId: null, workspaces: [], activeWorkspaceId: null };
  }
  const activeVaultId = current.activeVaultId === id ? vaults[0].id : current.activeVaultId;
  // A forgotten folder leaves every working set that held it; a set left empty disappears.
  const workspaces = localWorkspaceEntries(current)
    .map((workspace) => (
      workspace.vaultIds.includes(id)
        ? { ...workspace, vaultIds: workspace.vaultIds.filter((vaultId) => vaultId !== id) }
        : workspace
    ))
    .filter((workspace) => workspace.vaultIds.length > 0);
  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === current.activeWorkspaceId)
    ? current.activeWorkspaceId
    : null;
  return {
    ...current,
    vaults,
    workspaces,
    activeWorkspaceId,
    activeVaultId: (() => {
      const workspace = workspaces.find((candidate) => candidate.id === activeWorkspaceId);
      if (workspace && (!activeVaultId || !workspace.vaultIds.includes(activeVaultId))) return workspace.vaultIds[0];
      return activeVaultId && vaults.some((vault) => vault.id === activeVaultId) ? activeVaultId : vaults[0].id;
    })(),
  };
}

/** Creates a named working set of known folders; empty or unknown-only sets change nothing. */
export function createLocalWorkspace(
  current: LocalVaultSettings,
  name: string,
  vaultIds: string[],
): LocalVaultSettings {
  const known = new Set(current.vaults.map((vault) => vault.id));
  const ids = [...new Set(vaultIds.filter((id) => known.has(id)))];
  if (ids.length === 0) {
    return current;
  }
  if (localWorkspaceEntries(current).length >= MAX_LOCAL_WORKSPACES) throw new Error('Workspace limit reached. Remove a workspace before creating another.');
  const workspace: LocalWorkspaceEntry = {
    id: createLocalWorkspaceId(),
    name: normalizeWorkspaceName(name) ?? 'Local workspace',
    vaultIds: ids.slice(0, 32),
  };
  return { ...current, workspaces: [...localWorkspaceEntries(current), workspace] };
}

export function renameLocalWorkspace(
  current: LocalVaultSettings,
  id: string,
  name: string,
): LocalVaultSettings {
  const normalized = normalizeWorkspaceName(name);
  if (!normalized || !localWorkspaceEntries(current).some((workspace) => workspace.id === id)) {
    return current;
  }
  return {
    ...current,
    workspaces: localWorkspaceEntries(current).map((workspace) => (
      workspace.id === id ? { ...workspace, name: normalized } : workspace
    )),
  };
}

/** Deletes a working set; the folders themselves stay known and openable. */
export function removeLocalWorkspace(current: LocalVaultSettings, id: string): LocalVaultSettings {
  const existing = localWorkspaceEntries(current);
  const workspaces = existing.filter((workspace) => workspace.id !== id);
  if (workspaces.length === existing.length) {
    return current;
  }
  return {
    ...current,
    workspaces,
    activeWorkspaceId: current.activeWorkspaceId === id ? null : current.activeWorkspaceId,
  };
}

/** Activates a named working set; null returns to the single-vault view. */
export function setActiveLocalWorkspace(
  current: LocalVaultSettings,
  id: string | null,
): LocalVaultSettings {
  if (id === null) {
    return current.activeWorkspaceId === null ? current : { ...current, activeWorkspaceId: null };
  }
  return localWorkspaceEntries(current).some((workspace) => workspace.id === id)
    ? { ...current, activeWorkspaceId: id }
    : current;
}

/**
 * Replaces a working set's folders. An empty list deletes the set: a workspace with no roots has
 * nothing to show, and forgetting its last folder is the same gesture as removing it.
 */
export function setLocalWorkspaceVaults(
  current: LocalVaultSettings,
  id: string,
  vaultIds: string[],
): LocalVaultSettings {
  const workspace = localWorkspaceEntries(current).find((candidate) => candidate.id === id);
  if (!workspace) {
    return current;
  }
  const known = new Set(current.vaults.map((vault) => vault.id));
  const ids = [...new Set(vaultIds.filter((vaultId) => known.has(vaultId)))].slice(0, 32);
  if (ids.length === 0) {
    return removeLocalWorkspace(current, id);
  }
  return {
    ...current,
    activeVaultId: current.activeWorkspaceId === id && (!current.activeVaultId || !ids.includes(current.activeVaultId)) ? ids[0] : current.activeVaultId,
    workspaces: localWorkspaceEntries(current).map((candidate) => (
      candidate.id === id ? { ...candidate, vaultIds: ids } : candidate
    )),
  };
}
const customFontStackSchema = z.string().trim().refine((value) => !value || isSafeFontStack(value), {
  message: 'Use comma-separated font family names without CSS functions or declarations.',
});
const typographySettingsSchema = z.object({
  uiFontStack: customFontStackSchema.default(defaultThemeTypography.uiFontStack),
  editorFontStack: customFontStackSchema.default(defaultThemeTypography.editorFontStack),
  uiFontSize: z.number().int().min(MIN_UI_FONT_SIZE).max(MAX_UI_FONT_SIZE).default(DEFAULT_UI_FONT_SIZE),
  editorFontSize: z.number().int().min(MIN_EDITOR_FONT_SIZE).max(MAX_EDITOR_FONT_SIZE).default(DEFAULT_EDITOR_FONT_SIZE),
  fontSmoothing: z.enum(['antialiased', 'auto']).default(defaultThemeTypography.fontSmoothing),
}).default(defaultThemeTypography).transform((value): ThemeTypography => normalizeThemeTypography(value));
const electronActionIds = new Set<ElectronActionId>(ELECTRON_ACTIONS.map((action) => action.id));
const shortcutConfigSchema = z.string().trim().refine(isValidCustomShortcutConfig, {
  message: 'Use a modifier-based shortcut that is not reserved by the editor or operating system.',
});
const shortcutSettingsSchema = z.record(z.string(), shortcutConfigSchema)
  .default(defaultShortcutSettings)
  .transform((value): ShortcutSettings => {
    const shortcuts: ShortcutSettings = {};
    for (const [actionId, shortcut] of Object.entries(value)) {
      if (!electronActionIds.has(actionId as ElectronActionId)) {
        throw new Error(`Unknown shortcut action: ${actionId}`);
      }
      shortcuts[actionId as ElectronActionId] = shortcut;
    }
    return shortcuts;
  });
const aiProviderSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  model: z.string().trim().min(1).max(200).nullable().default(null),
  commandPath: z.string().trim().min(1).max(4096).nullable().default(null),
  ignoreApiKey: z.boolean().default(false),
}).default(defaultAiProviderSettings);
export const aiCustomCommandSchema = z.object({
  // Saving requires a UUID, so an entry without one is dropped here instead of breaking every save.
  id: z.uuid(),
  name: z.string().trim().min(1).max(MAX_AI_COMMAND_NAME_CHARACTERS),
  prompt: z.string().trim().min(1).max(MAX_AI_COMMAND_PROMPT_CHARACTERS),
  delivery: z.enum(['replace', 'insert-below']),
});
/**
 * One damaged command is dropped on its own: failing the whole list would reset the `ai` section,
 * and with it the provider switches.
 */
const aiCustomCommandsSchema = z.array(z.unknown()).default([]).transform((items): AiCustomCommand[] => {
  const seen = new Set<string>();
  const commands: AiCustomCommand[] = [];
  for (const item of items) {
    const result = aiCustomCommandSchema.safeParse(item);
    if (!result.success || seen.has(result.data.id)) continue;
    seen.add(result.data.id);
    commands.push(result.data);
  }
  return commands.slice(0, MAX_AI_CUSTOM_COMMANDS);
});
const aiSettingsSchema = z.object({
  providers: z.object({
    codex: aiProviderSettingsSchema,
    claude: aiProviderSettingsSchema,
  }).default(defaultAiSettings.providers),
  defaultProvider: z.enum(AI_PROVIDER_IDS).nullable().default(null),
  selectionChip: z.boolean().default(true),
  translateLanguage: z.string().trim().min(1).max(64).default('English'),
  customCommands: aiCustomCommandsSchema,
}).default(defaultAiSettings);
const offlineSettingsSchema = z.object({
  keepHackmdNotes: z.boolean().default(true),
}).default(defaultOfflineSettings);
export const quickCapturePinShortcutSchema = z.string().trim().toLowerCase().refine(isValidQuickCapturePinShortcut, {
  message: 'Use a shortcut with Command, Control or Alt that Quick Hack does not already use.',
});
const quickCaptureSettingsSchema = z.object({
  keepOpen: z.boolean().default(defaultQuickCaptureSettings.keepOpen),
  pinShortcut: quickCapturePinShortcutSchema.default(defaultQuickCaptureSettings.pinShortcut),
}).default(defaultQuickCaptureSettings);
// One unreadable field falls back alone, so a hand-edited shortcut does not also turn off Keep open.
const storedQuickCaptureSettingsSchema = z.object({
  keepOpen: quickCaptureSettingsSchema.unwrap().shape.keepOpen.catch(defaultQuickCaptureSettings.keepOpen),
  pinShortcut: quickCaptureSettingsSchema.unwrap().shape.pinShortcut.catch(defaultQuickCaptureSettings.pinShortcut),
}).default(defaultQuickCaptureSettings);
const dictationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  locale: z.string().trim().min(1).max(MAX_DICTATION_LOCALE_LENGTH).nullable().default(null),
}).default(defaultDictationSettings);
const pinnedTeamIdsSchema = z.array(z.string().trim().min(1)).nullable().refine(
  (teamIds) => teamIds === null || new Set(teamIds).size === teamIds.length,
  'Pinned team IDs must be unique.',
);

export const appearanceSettingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default(defaultAppearanceSettings.theme),
  presetId: z.enum(['hackmd-neo', 'solarized', 'catppuccin', 'dracula', 'gruvbox', 'noctis']).default(defaultAppearanceSettings.presetId),
  customSeed: z.object({
    neutral: hexColorSchema.optional(),
    primary: hexColorSchema.optional(),
    success: hexColorSchema.optional(),
    warning: hexColorSchema.optional(),
    destructive: hexColorSchema.optional(),
  }).default(defaultAppearanceSettings.customSeed),
  typography: typographySettingsSchema,
}).default(defaultAppearanceSettings).transform((value): AppearanceSettings => ({
  theme: normalizeThemeMode(value.theme, defaultAppearanceSettings.theme),
  presetId: normalizeThemePresetId(value.presetId, defaultAppearanceSettings.presetId),
  customSeed: normalizeThemeSeed(value.customSeed),
  typography: normalizeThemeTypography(value.typography),
}));

export const settingsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(50, 'Title too long'),
  hackmdApiToken: z.string().trim().default(''),
  hackmdAccounts: hackmdAccountsSettingsSchema,
  appearance: appearanceSettingsSchema,
  onboarding: z.object({
    hackmdTokenSetupDeferred: z.boolean().default(defaultOnboardingSettings.hackmdTokenSetupDeferred),
  }).default(defaultOnboardingSettings),
  localVault: localVaultSettingsSchema,
  editor: z.object({
    mode: z.enum(['standard', 'emacs', 'vim', 'helix', 'kakoune']).default(defaultEditorSettings.mode),
  }).default(defaultEditorSettings),
  shortcuts: shortcutSettingsSchema,
  keyboardNavigation: z.object({
    characterShortcutsEnabled: z.boolean().default(true),
    keyHintsVisible: z.boolean().default(true),
  }).default({ characterShortcutsEnabled: true, keyHintsVisible: true }),
  workspaceNavigation: z.object({
    pinnedTeamIds: pinnedTeamIdsSchema.default(null),
  }).default(defaultWorkspaceNavigationSettings),
  ai: aiSettingsSchema,
  dictation: dictationSettingsSchema,
  offline: offlineSettingsSchema,
  quickCapture: quickCaptureSettingsSchema,
  appIcon: z.enum(APP_ICON_IDS).catch(DEFAULT_APP_ICON),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: AppSettings = {
  title: DEFAULT_TITLE,
  hackmdApiToken: '',
  hackmdAccounts: defaultHackmdAccountsSettings,
  appearance: defaultAppearanceSettings,
  onboarding: defaultOnboardingSettings,
  localVault: defaultLocalVaultSettings,
  editor: defaultEditorSettings,
  shortcuts: defaultShortcutSettings,
  keyboardNavigation: { characterShortcutsEnabled: true, keyHintsVisible: true },
  workspaceNavigation: defaultWorkspaceNavigationSettings,
  ai: defaultAiSettings,
  dictation: defaultDictationSettings,
  offline: defaultOfflineSettings,
  quickCapture: defaultQuickCaptureSettings,
  appIcon: DEFAULT_APP_ICON,
};

const storedShortcutSettingsSchema = z.record(z.string(), z.unknown())
  .catch({})
  .transform((value): ShortcutSettings => {
    const shortcuts: ShortcutSettings = {};
    for (const [actionId, shortcut] of Object.entries(value)) {
      if (!electronActionIds.has(actionId as ElectronActionId)) {
        continue;
      }
      const result = shortcutConfigSchema.safeParse(shortcut);
      if (result.success) {
        shortcuts[actionId as ElectronActionId] = result.data;
      }
    }
    return shortcuts;
  });

const storedSettingsSchema = z.object({
  title: settingsSchema.shape.title.catch(defaultSettings.title),
  hackmdApiToken: settingsSchema.shape.hackmdApiToken.catch(defaultSettings.hackmdApiToken),
  hackmdAccounts: settingsSchema.shape.hackmdAccounts.catch(defaultSettings.hackmdAccounts),
  appearance: settingsSchema.shape.appearance.catch(defaultSettings.appearance),
  onboarding: settingsSchema.shape.onboarding.catch(defaultSettings.onboarding),
  localVault: settingsSchema.shape.localVault.catch(defaultSettings.localVault),
  editor: settingsSchema.shape.editor.catch(defaultSettings.editor),
  shortcuts: storedShortcutSettingsSchema.default(defaultSettings.shortcuts),
  keyboardNavigation: settingsSchema.shape.keyboardNavigation.catch(defaultSettings.keyboardNavigation),
  workspaceNavigation: settingsSchema.shape.workspaceNavigation.catch(defaultSettings.workspaceNavigation),
  ai: settingsSchema.shape.ai.catch(defaultSettings.ai),
  dictation: settingsSchema.shape.dictation.catch(defaultSettings.dictation),
  offline: settingsSchema.shape.offline.catch(defaultSettings.offline),
  quickCapture: storedQuickCaptureSettingsSchema.catch(defaultSettings.quickCapture),
  appIcon: settingsSchema.shape.appIcon,
});

export function normalizeAppearanceSettings(
  appearance: unknown,
  fallback: AppearanceSettings = defaultAppearanceSettings,
): AppearanceSettings {
  const result = appearanceSettingsSchema.safeParse(appearance);

  if (!result.success) {
    return fallback;
  }

  return result.data;
}

function getSettingsError(error: unknown) {
  if (error instanceof z.ZodError) {
    return new Error(error.issues[0]?.message ?? 'Invalid settings');
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Invalid settings');
}

export function validateSettings(settings: unknown): AppSettings {
  const result = settingsSchema.safeParse(settings);

  if (!result.success) {
    throw getSettingsError(result.error);
  }

  return result.data;
}

export function parseSettings(content: string): AppSettings {
  try {
    return validateSettings(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format');
    }

    throw getSettingsError(error);
  }
}

export function parseStoredSettings(content: string): AppSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format');
    }
    throw getSettingsError(error);
  }

  const result = storedSettingsSchema.safeParse(parsed);
  if (!result.success) {
    throw getSettingsError(result.error);
  }
  return result.data;
}

export function parseSettingsOrDefault(
  content?: string | null,
  fallback: AppSettings = defaultSettings,
  onError?: (error: Error) => void,
): AppSettings {
  if (!content) {
    return fallback;
  }

  try {
    return parseSettings(content);
  } catch (error) {
    onError?.(getSettingsError(error));
    return fallback;
  }
}

export function serializeSettings(settings: AppSettings) {
  return JSON.stringify(validateSettings(settings), null, 2);
}
