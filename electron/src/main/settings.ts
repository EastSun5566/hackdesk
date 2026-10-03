import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';

import {
  defaultSettings,
  parseStoredSettings,
  serializeSettings,
  validateSettings,
  type AppSettings,
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
  encryptedToken?: unknown;
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
  encryptedToken?: unknown,
  tokenStorageError?: string,
): ElectronSafeSettings {
  const hasHackmdApiToken = encryptedToken !== undefined || settings.hackmdApiToken.trim().length > 0;
  const hasLocalVault = typeof settings.localVault.path === 'string' && settings.localVault.path.trim().length > 0;

  return {
    title: settings.title,
    appearance: settings.appearance,
    editor: settings.editor,
    shortcuts: settings.shortcuts,
    workspaceNavigation: settings.workspaceNavigation,
    hasHackmdApiToken,
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
    const hasEncryptedToken = isRecord(parsed) && Object.hasOwn(parsed, 'hackmdApiTokenEncrypted');
    return {
      settings: hasEncryptedToken ? { ...settings, hackmdApiToken: '' } : settings,
      hasStoredAppearance: hasAppearanceSettings(content),
      ...(hasEncryptedToken ? { encryptedToken: parsed.hackmdApiTokenEncrypted } : {}),
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
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
  if (metadata.encryptedToken === undefined && metadata.settings.hackmdApiToken) {
    try {
      const encryptedToken = encryptHackmdToken(metadata.settings.hackmdApiToken);
      await writeStoredSettings(metadata.settings, encryptedToken);
      return { ...metadata, settings: { ...metadata.settings, hackmdApiToken: '' }, encryptedToken };
    } catch {
      // Preserve the original file so an unavailable keyring or failed write cannot lose a token.
      return { ...metadata, tokenStorageError: legacyTokenStorageError };
    }
  }
  return metadata;
}

// Configuration reads must work even when the OS credential store is locked.
export function readStoredSettings(): Promise<AppSettings> {
  return enqueueSettingsOperation(async () => ({ ...(await readAndMigrateSettings()).settings, hackmdApiToken: '' }));
}

async function safeSettingsFromMetadata(metadata: StoredSettingsMetadata): Promise<ElectronSafeSettings> {
  let tokenStorageError = metadata.tokenStorageError;
  if (metadata.encryptedToken !== undefined) {
    try { decryptHackmdToken(metadata.encryptedToken); }
    catch (error) { tokenStorageError = error instanceof Error ? error.message : 'Could not unlock the saved HackMD token.'; }
  }
  const hackmdCliConfig = await getHackmdCliConfigStatus();
  return toSafeSettings(metadata.settings, metadata.hasStoredAppearance, hackmdCliConfig, metadata.encryptedToken, tokenStorageError);
}

export function getSafeSettings(): Promise<ElectronSafeSettings> {
  return enqueueSettingsOperation(async () => safeSettingsFromMetadata(await readAndMigrateSettings()));
}

async function writeStoredSettings(settings: AppSettings, encryptedToken?: unknown) {
  const parsed = JSON.parse(serializeSettings({
    ...settings,
    hackmdApiToken: encryptedToken !== undefined ? '' : settings.hackmdApiToken,
  }));
  if (encryptedToken !== undefined) parsed.hackmdApiTokenEncrypted = encryptedToken;
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
  update: ElectronSettingsUpdate & { localVaultPath?: string | null },
): Promise<ElectronSafeSettings> {
  const metadata = await readStoredSettingsWithMetadata();
  const current = metadata.settings;
  let encryptedToken = metadata.encryptedToken;
  let retainedLegacyToken = '';
  let tokenStorageError: string | undefined;
  if (update.hackmdApiToken !== undefined) {
    const token = update.hackmdApiToken.trim();
    encryptedToken = token ? encryptHackmdToken(token) : undefined;
  } else if (current.hackmdApiToken) {
    try {
      encryptedToken = encryptHackmdToken(current.hackmdApiToken);
    } catch {
      // Only preserve an existing legacy credential; new credentials never fall back to plaintext.
      retainedLegacyToken = current.hackmdApiToken;
      tokenStorageError = legacyTokenStorageError;
    }
  }
  const nextOnboarding = update.hackmdApiToken && update.hackmdApiToken.trim()
    ? { ...current.onboarding, hackmdTokenSetupDeferred: false }
    : update.onboarding ?? current.onboarding;
  const next = validateSettings({
    title: update.title ?? current.title,
    hackmdApiToken: retainedLegacyToken,
    appearance: update.appearance ?? current.appearance,
    editor: update.editor ?? current.editor,
    shortcuts: update.shortcuts ?? current.shortcuts,
    workspaceNavigation: update.workspaceNavigation ?? current.workspaceNavigation,
    onboarding: nextOnboarding,
    localVault: update.localVaultPath !== undefined ? { path: update.localVaultPath } : current.localVault,
  });

  await writeStoredSettings(next, encryptedToken);

  return safeSettingsFromMetadata({ settings: next, hasStoredAppearance: true, encryptedToken, tokenStorageError });
}

export function updateStoredSettings(
  update: ElectronSettingsUpdate & { localVaultPath?: string | null },
): Promise<ElectronSafeSettings> {
  return enqueueSettingsOperation(() => updateStoredSettingsUnlocked(update));
}

export function readHackmdApiToken(): Promise<string> {
  return enqueueSettingsOperation(async () => {
    const metadata = await readAndMigrateSettings();
    if (metadata.tokenStorageError) throw new Error(metadata.tokenStorageError);
    const token = metadata.encryptedToken !== undefined ? decryptHackmdToken(metadata.encryptedToken).trim() : '';

    if (!token) {
      throw new Error('HackMD API token is not configured. Please add it in Settings.');
    }

    return token;
  });
}
