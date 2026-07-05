import { mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  defaultSettings,
  parseSettingsOrDefault,
  serializeSettings,
  validateSettings,
  type AppSettings,
} from '../../../src/lib/settings';
import type { ElectronSafeSettings, ElectronSettingsUpdate, HackmdCliConfigStatus } from '../../../src/lib/electron-api';
import { getHackDeskRootPath, getHackmdCliConfigPath, getSettingsPath } from './paths';

const defaultHackmdCliConfigStatus: HackmdCliConfigStatus = {
  hasAccessToken: false,
  hasCustomEndpoint: false,
};

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
): ElectronSafeSettings {
  const hasHackmdApiToken = settings.hackmdApiToken.trim().length > 0;
  const hasLocalVault = typeof settings.localVault.path === 'string' && settings.localVault.path.trim().length > 0;

  return {
    title: settings.title,
    appearance: settings.appearance,
    editor: settings.editor,
    shortcuts: settings.shortcuts,
    hasHackmdApiToken,
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

async function readStoredSettingsWithMetadata(): Promise<{ settings: AppSettings; hasStoredAppearance: boolean }> {
  try {
    const content = await readFile(getSettingsPath(), 'utf8');
    return {
      settings: parseSettingsOrDefault(content, defaultSettings),
      hasStoredAppearance: hasAppearanceSettings(content),
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

export async function readStoredSettings(): Promise<AppSettings> {
  return (await readStoredSettingsWithMetadata()).settings;
}

export async function getSafeSettings(): Promise<ElectronSafeSettings> {
  const { settings, hasStoredAppearance } = await readStoredSettingsWithMetadata();
  const hackmdCliConfig = await getHackmdCliConfigStatus();
  return toSafeSettings(settings, hasStoredAppearance, hackmdCliConfig);
}

export async function updateStoredSettings(update: ElectronSettingsUpdate): Promise<ElectronSafeSettings> {
  const current = await readStoredSettings();
  const nextHackmdApiToken = update.hackmdApiToken ?? current.hackmdApiToken;
  const nextOnboarding = update.hackmdApiToken && update.hackmdApiToken.trim()
    ? { ...current.onboarding, hackmdTokenSetupDeferred: false }
    : update.onboarding ?? current.onboarding;
  const next = validateSettings({
    title: update.title ?? current.title,
    hackmdApiToken: nextHackmdApiToken,
    appearance: update.appearance ?? current.appearance,
    editor: update.editor ?? current.editor,
    shortcuts: update.shortcuts ?? current.shortcuts,
    onboarding: nextOnboarding,
    localVault: update.localVault ?? current.localVault,
  });

  await mkdir(getHackDeskRootPath(), { recursive: true });
  await writeFile(getSettingsPath(), serializeSettings(next), 'utf8');

  const hackmdCliConfig = await getHackmdCliConfigStatus();
  return toSafeSettings(next, true, hackmdCliConfig);
}

export async function readHackmdApiToken() {
  const settings = await readStoredSettings();
  const token = settings.hackmdApiToken.trim();

  if (!token) {
    throw new Error('HackMD API token is not configured. Please add it in Settings.');
  }

  return token;
}
