import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';

import {
  addHackmdAccount,
  addLocalVault,
  defaultSettings,
  getActiveHackmdAccount,
  getActiveLocalVaultPath,
  parseStoredSettings,
  removeHackmdAccount,
  removeLocalVault,
  serializeSettings,
  setActiveHackmdAccount,
  setActiveLocalVault,
  validateSettings,
  type AppSettings,
  type HackmdAccountsSettings,
} from '../../../src/lib/settings';
import type { ElectronSafeSettings, ElectronSettingsUpdate, HackmdCliConfigStatus } from '../../../src/lib/electron-api';
import { getHackDeskRootPath, getHackmdCliConfigPath, getSettingsPath } from './paths';
import { decryptHackmdToken, encryptHackmdToken } from './token-storage';

const defaultHackmdCliConfigStatus: HackmdCliConfigStatus = {
  hasAccessToken: false,
  hasCustomEndpoint: false,
};
let settingsUpdateQueue = Promise.resolve();
const legacyTokenStorageError = 'Your saved HackMD token could not be protected. Unlock your system keyring and try again, or disconnect HackMD.';

type StoredSettingsMetadata = {
  settings: AppSettings;
  hasStoredAppearance: boolean;
  /** Encrypted tokens by account id. */
  accountTokens?: Record<string, unknown>;
  tokenStorageError?: string;
};

function enqueueSettingsOperation<T>(task: () => Promise<T>): Promise<T> {
  const result = settingsUpdateQueue.then(task);
  settingsUpdateQueue = result.then(() => undefined, () => undefined);
  return result;
}

function hasAppearanceSettings(content: string) {
  try {
    const parsed = JSON.parse(content) as { appearance?: unknown };
    return parsed.appearance !== undefined;
  } catch {
    return false;
  }
}

function toSafeSettings(
  settings: AppSettings,
  hasStoredAppearance = true,
  hackmdCliConfig: HackmdCliConfigStatus = defaultHackmdCliConfigStatus,
  accountTokens?: Record<string, unknown>,
  tokenStorageError?: string,
): ElectronSafeSettings {
  const activeAccount = getActiveHackmdAccount(settings);
  const activeBlob = activeAccount ? accountTokens?.[activeAccount.id] : undefined;
  const hasHackmdApiToken = activeBlob !== undefined || settings.hackmdApiToken.trim().length > 0;
  const hasLocalVault = getActiveLocalVaultPath(settings) !== null;

  return {
    title: settings.title,
    appearance: settings.appearance,
    editor: settings.editor,
    shortcuts: settings.shortcuts,
    keyboardNavigation: settings.keyboardNavigation,
    workspaceNavigation: settings.workspaceNavigation,
    ai: settings.ai,
    dictation: settings.dictation,
    offline: settings.offline,
    hasHackmdApiToken,
    hackmdAccounts: {
      accounts: settings.hackmdAccounts.accounts.map((account) => ({
        ...account,
        hasToken: accountTokens?.[account.id] !== undefined,
      })),
      activeAccountId: activeAccount?.id ?? null,
    },
    hackmdTokenStorageError: tokenStorageError ?? null,
    hasAppearanceSettings: hasStoredAppearance,
    hasLocalVault,
    localVault: settings.localVault,
    hackmdCliConfig,
    onboarding: settings.onboarding,
    shouldShowHackmdOnboarding: !hasLocalVault && !hasHackmdApiToken && !settings.onboarding.hackmdTokenSetupDeferred,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readHackmdCliConfigJson(): Promise<unknown> {
  const content = await readFile(getHackmdCliConfigPath(), 'utf8');
  return JSON.parse(content);
}

export async function getHackmdCliConfigStatus(): Promise<HackmdCliConfigStatus> {
  try {
    const parsed = await readHackmdCliConfigJson();
    if (!isRecord(parsed)) {
      return defaultHackmdCliConfigStatus;
    }

    return {
      hasAccessToken: typeof parsed.accessToken === 'string' && parsed.accessToken.trim().length > 0,
      hasCustomEndpoint: typeof parsed.hackmdAPIEndpointURL === 'string'
        && parsed.hackmdAPIEndpointURL.trim().length > 0,
    };
  } catch {
    return defaultHackmdCliConfigStatus;
  }
}

export async function readHackmdCliAccessToken(): Promise<string> {
  let parsed: unknown;

  try {
    parsed = await readHackmdCliConfigJson();
  } catch {
    throw new Error('No hackmd-cli token was found. Paste a HackMD API token manually.');
  }

  if (!isRecord(parsed)) {
    throw new Error('No hackmd-cli token was found. Paste a HackMD API token manually.');
  }

  const hasCustomEndpoint = typeof parsed.hackmdAPIEndpointURL === 'string'
    && parsed.hackmdAPIEndpointURL.trim().length > 0;
  if (hasCustomEndpoint) {
    throw new Error('hackmd-cli custom endpoint import is not supported yet.');
  }

  const token = typeof parsed.accessToken === 'string' ? parsed.accessToken.trim() : '';
  if (!token) {
    throw new Error('No hackmd-cli token was found. Paste a HackMD API token manually.');
  }

  return token;
}

async function readStoredSettingsWithMetadata(): Promise<StoredSettingsMetadata> {
  try {
    const content = await readFile(getSettingsPath(), 'utf8');
    const settings = parseStoredSettings(content);
    const parsed: unknown = JSON.parse(content);
    const accountTokens: Record<string, unknown> = {};
    if (isRecord(parsed) && isRecord(parsed.hackmdAccountTokensEncrypted)) {
      Object.assign(accountTokens, parsed.hackmdAccountTokensEncrypted);
    }
    // A single-token file from before multi-account support becomes one unnamed account.
    // An interrupted migration left both shapes: the old token joins as one more account.
    const legacyBlob = isRecord(parsed) && Object.hasOwn(parsed, 'hackmdApiTokenEncrypted')
      ? parsed.hackmdApiTokenEncrypted
      : undefined;
    let migratedSettings = settings;
    if (legacyBlob !== undefined) {
      const previousActive = settings.hackmdAccounts.activeAccountId;
      const withLegacy = addHackmdAccount(settings.hackmdAccounts, '');
      const added = withLegacy.accounts.at(-1);
      if (added) {
        accountTokens[added.id] = legacyBlob;
      }
      migratedSettings = {
        ...settings,
        hackmdApiToken: '',
        // A fresh file activates the migrated token; an interrupted migration keeps its account.
        hackmdAccounts: previousActive
          ? setActiveHackmdAccount(withLegacy, previousActive)
          : withLegacy,
      };
    }
    return {
      settings: migratedSettings,
      hasStoredAppearance: hasAppearanceSettings(content),
      ...(Object.keys(accountTokens).length > 0 ? { accountTokens } : {}),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        settings: defaultSettings,
        hasStoredAppearance: false,
      };
    }

    throw error;
  }
}

async function readAndMigrateSettings(): Promise<StoredSettingsMetadata> {
  const metadata = await readStoredSettingsWithMetadata();
  if (metadata.accountTokens === undefined && metadata.settings.hackmdApiToken) {
    try {
      const blob = encryptHackmdToken(metadata.settings.hackmdApiToken);
      let accounts = metadata.settings.hackmdAccounts;
      let active = getActiveHackmdAccount({ hackmdAccounts: accounts });
      if (!active) {
        accounts = addHackmdAccount(accounts, '');
        active = getActiveHackmdAccount({ hackmdAccounts: accounts });
      }
      const accountTokens = active ? { [active.id]: blob } : {};
      const settings = { ...metadata.settings, hackmdApiToken: '', hackmdAccounts: accounts };
      await writeStoredSettings(settings, accountTokens);
      return { ...metadata, settings, accountTokens };
    } catch {
      // Preserve the original file so an unavailable keyring or failed write cannot lose a token.
      return { ...metadata, tokenStorageError: legacyTokenStorageError };
    }
  }
  return metadata;
}

export type SettingsFileProblem = {
  kind: 'invalid' | 'unreadable';
  message: string;
  path: string;
};

function isMissingFileError(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

async function inspectSettingsFileUnlocked(): Promise<SettingsFileProblem | null> {
  const path = getSettingsPath();
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) return null;
    return { kind: 'unreadable', message: error instanceof Error ? error.message : String(error), path };
  }
  try {
    parseStoredSettings(content);
    return null;
  } catch (error) {
    return { kind: 'invalid', message: error instanceof Error ? error.message : String(error), path };
  }
}

/** Reports a settings file that exists but cannot be read or parsed. Never writes. */
export function inspectSettingsFile(): Promise<SettingsFileProblem | null> {
  return enqueueSettingsOperation(inspectSettingsFileUnlocked);
}

async function getUnusedBackupPath(path: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const candidate of [`${path}.damaged-${stamp}`, `${path}.damaged-${stamp}-${randomUUID()}`]) {
    try {
      await lstat(candidate);
    } catch (error) {
      if (isMissingFileError(error)) return candidate;
      throw error;
    }
  }
  throw new Error('Could not choose a backup path for the damaged settings file.');
}

/**
 * Moves a damaged settings file aside and writes default settings. Only runs
 * after explicit user confirmation, and does nothing if the file is no longer damaged.
 */
export function resetDamagedSettingsFile(): Promise<{ backupPath: string } | null> {
  return enqueueSettingsOperation(async () => {
    if (!await inspectSettingsFileUnlocked()) return null;
    const settingsPath = getSettingsPath();
    const backupPath = await getUnusedBackupPath(settingsPath);
    // Rename keeps the exact original bytes; defaults are written only after it succeeds.
    await rename(settingsPath, backupPath);
    try {
      await writeStoredSettings(defaultSettings);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // A missing settings file would start as a first run, so put the damaged file back.
      try {
        await rename(backupPath, settingsPath);
      } catch {
        throw new Error(`Default settings could not be written (${reason}). The damaged file is saved as ${backupPath}.`);
      }
      throw new Error(`Default settings could not be written (${reason}). The original file was restored.`);
    }
    return { backupPath };
  });
}

// Configuration reads must work even when the OS credential store is locked.
export function readStoredSettings(): Promise<AppSettings> {
  return enqueueSettingsOperation(async () => ({ ...(await readAndMigrateSettings()).settings, hackmdApiToken: '' }));
}

async function safeSettingsFromMetadata(metadata: StoredSettingsMetadata): Promise<ElectronSafeSettings> {
  let tokenStorageError = metadata.tokenStorageError;
  const activeAccount = getActiveHackmdAccount(metadata.settings);
  const activeBlob = activeAccount ? metadata.accountTokens?.[activeAccount.id] : undefined;
  if (activeBlob !== undefined) {
    try { decryptHackmdToken(activeBlob); }
    catch (error) { tokenStorageError = error instanceof Error ? error.message : 'Could not unlock the saved HackMD token.'; }
  }
  const hackmdCliConfig = await getHackmdCliConfigStatus();
  return toSafeSettings(metadata.settings, metadata.hasStoredAppearance, hackmdCliConfig, metadata.accountTokens, tokenStorageError);
}

export function getSafeSettings(): Promise<ElectronSafeSettings> {
  return enqueueSettingsOperation(async () => safeSettingsFromMetadata(await readAndMigrateSettings()));
}

async function writeStoredSettings(settings: AppSettings, accountTokens?: Record<string, unknown>, options?: { legacyPlaintextToken?: string }) {
  const parsed = JSON.parse(serializeSettings({
    ...settings,
    hackmdApiToken: options?.legacyPlaintextToken ?? (accountTokens !== undefined ? '' : settings.hackmdApiToken),
  }));
  if (accountTokens !== undefined && Object.keys(accountTokens).length > 0) {
    parsed.hackmdAccountTokensEncrypted = accountTokens;
  }
  const content = JSON.stringify(parsed, null, 2);
  await mkdir(getHackDeskRootPath(), { recursive: true, mode: 0o700 });
  const settingsPath = getSettingsPath();
  const temporaryPath = `${settingsPath}.tmp-${randomUUID()}`;
  let created = false;
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    created = true;
    try {
      await handle.writeFile(content, 'utf8');
      await handle.datasync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, settingsPath);
  } finally {
    if (created) await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function updateStoredSettingsUnlocked(
  update: ElectronSettingsUpdate & {
    localVaultPath?: string | null;
    /** Switches the active vault; unknown ids keep the current one. */
    localVaultActivateId?: string;
    /** Forgets one vault, falling back when it was active. */
    localVaultRemoveId?: string;
  },
): Promise<ElectronSafeSettings> {
  const metadata = await readStoredSettingsWithMetadata();
  const current = metadata.settings;
  let nextAccounts: HackmdAccountsSettings = current.hackmdAccounts;
  let nextTokens: Record<string, unknown> = { ...(metadata.accountTokens ?? {}) };
  let retainedLegacyToken = '';
  let tokenStorageError: string | undefined;
  const labelUpdate = update.hackmdAccountLabel?.trim().slice(0, 200);
  if (update.hackmdApiToken !== undefined) {
    const token = update.hackmdApiToken.trim();
    if (!token) {
      // Disconnecting forgets the active account and falls back to the next one.
      const active = getActiveHackmdAccount({ hackmdAccounts: nextAccounts });
      if (active) {
        nextAccounts = removeHackmdAccount(nextAccounts, active.id);
        delete nextTokens[active.id];
      }
    } else {
      const blob = encryptHackmdToken(token);
      let active = getActiveHackmdAccount({ hackmdAccounts: nextAccounts });
      let activeToken = '';
      if (active && nextTokens[active.id] !== undefined) {
        try {
          activeToken = decryptHackmdToken(nextTokens[active.id]).trim();
        } catch {
          // A broken token never matches: the save replaces it.
        }
      }
      if ((update.hackmdAddAccount && activeToken !== token) || !active) {
        nextAccounts = addHackmdAccount(nextAccounts, labelUpdate ?? '');
        active = getActiveHackmdAccount({ hackmdAccounts: nextAccounts });
      } else if (labelUpdate !== undefined && active) {
        const activeId = active.id;
        nextAccounts = {
          accounts: nextAccounts.accounts.map((account) => (
            account.id === activeId ? { ...account, label: labelUpdate } : account
          )),
          activeAccountId: nextAccounts.activeAccountId,
        };
      }
      if (active) {
        nextTokens[active.id] = blob;
      }
    }
  } else if (current.hackmdApiToken) {
    // A plaintext file from before account migration moves into the active account now.
    try {
      const blob = encryptHackmdToken(current.hackmdApiToken);
      let active = getActiveHackmdAccount({ hackmdAccounts: nextAccounts });
      if (!active) {
        nextAccounts = addHackmdAccount(nextAccounts, labelUpdate ?? '');
        active = getActiveHackmdAccount({ hackmdAccounts: nextAccounts });
      }
      if (active) {
        nextTokens[active.id] = blob;
      }
    } catch {
      // Only preserve an existing legacy credential; new credentials never fall back to plaintext.
      retainedLegacyToken = current.hackmdApiToken;
      tokenStorageError = legacyTokenStorageError;
    }
  }
  if (update.hackmdActiveAccountId !== undefined) {
    nextAccounts = setActiveHackmdAccount(nextAccounts, update.hackmdActiveAccountId);
  }
  if (update.hackmdRemoveAccountId !== undefined) {
    nextAccounts = removeHackmdAccount(nextAccounts, update.hackmdRemoveAccountId);
  }
  // Blobs without an account are dropped so removed accounts leave nothing behind.
  const knownAccountIds = new Set(nextAccounts.accounts.map((account) => account.id));
  for (const id of Object.keys(nextTokens)) {
    if (!knownAccountIds.has(id)) {
      delete nextTokens[id];
    }
  }
  // Choosing a folder adds it to the vault list and activates it; forgetting removes the
  // given vault and activates the first remaining one when it was the active one.
  let nextVaults = current.localVault;
  if (update.localVaultRemoveId !== undefined) {
    nextVaults = removeLocalVault(nextVaults, update.localVaultRemoveId);
  } else if (update.localVaultActivateId !== undefined) {
    nextVaults = setActiveLocalVault(nextVaults, update.localVaultActivateId);
  } else if (update.localVaultPath !== undefined) {
    nextVaults = update.localVaultPath === null
      ? (nextVaults.activeVaultId ? removeLocalVault(nextVaults, nextVaults.activeVaultId) : nextVaults)
      : addLocalVault(nextVaults, update.localVaultPath);
  }
  const nextOnboarding = update.hackmdApiToken && update.hackmdApiToken.trim()
    ? { ...current.onboarding, hackmdTokenSetupDeferred: false }
    : update.onboarding ?? current.onboarding;
  const next = validateSettings({
    title: update.title ?? current.title,
    hackmdApiToken: retainedLegacyToken,
    hackmdAccounts: nextAccounts,
    appearance: update.appearance ?? current.appearance,
    editor: update.editor ?? current.editor,
    shortcuts: update.shortcuts ?? current.shortcuts,
    keyboardNavigation: update.keyboardNavigation ?? current.keyboardNavigation,
    workspaceNavigation: update.workspaceNavigation ?? current.workspaceNavigation,
    ai: update.ai ?? current.ai,
    dictation: update.dictation ?? current.dictation,
    offline: update.offline ?? current.offline,
    onboarding: nextOnboarding,
    // Choosing a folder adds it to the vault list and activates it; forgetting removes the
    // active vault and falls back to the first remaining one.
    localVault: nextVaults,
  });

  await writeStoredSettings(
    next,
    nextTokens,
    retainedLegacyToken ? { legacyPlaintextToken: retainedLegacyToken } : undefined,
  );

  return safeSettingsFromMetadata({ settings: next, hasStoredAppearance: true, accountTokens: nextTokens, tokenStorageError });
}

export function updateStoredSettings(
  update: ElectronSettingsUpdate & {
    localVaultPath?: string | null;
    localVaultActivateId?: string;
    localVaultRemoveId?: string;
  },
): Promise<ElectronSafeSettings> {
  return enqueueSettingsOperation(() => updateStoredSettingsUnlocked(update));
}

export function readHackmdApiToken(): Promise<string> {
  return enqueueSettingsOperation(async () => {
    const metadata = await readAndMigrateSettings();
    if (metadata.tokenStorageError) throw new Error(metadata.tokenStorageError);
    const active = getActiveHackmdAccount(metadata.settings);
    const blob = active ? metadata.accountTokens?.[active.id] : undefined;
    const token = blob !== undefined ? decryptHackmdToken(blob).trim() : '';

    if (!token) {
      throw new Error('HackMD API token is not configured. Please add it in Settings.');
    }

    return token;
  });
}
