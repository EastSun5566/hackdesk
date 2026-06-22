import { mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  defaultSettings,
  parseSettingsOrDefault,
  serializeSettings,
  validateSettings,
  type AppSettings,
} from '../../../src/lib/settings';
import type { ElectronSafeSettings, ElectronSettingsUpdate } from '../../../src/lib/electron-api';
import { getHackDeskRootPath, getSettingsPath } from './paths';

function hasAppearanceSettings(content: string) {
  try {
    const parsed = JSON.parse(content) as { appearance?: unknown };
    return parsed.appearance !== undefined;
  } catch {
    return false;
  }
}

function toSafeSettings(settings: AppSettings, hasStoredAppearance = true): ElectronSafeSettings {
  return {
    title: settings.title,
    appearance: settings.appearance,
    hasHackmdApiToken: settings.hackmdApiToken.trim().length > 0,
    hasAppearanceSettings: hasStoredAppearance,
  };
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
  return toSafeSettings(settings, hasStoredAppearance);
}

export async function updateStoredSettings(update: ElectronSettingsUpdate): Promise<ElectronSafeSettings> {
  const current = await readStoredSettings();
  const next = validateSettings({
    title: update.title ?? current.title,
    hackmdApiToken: update.hackmdApiToken ?? current.hackmdApiToken,
    appearance: update.appearance ?? current.appearance,
  });

  await mkdir(getHackDeskRootPath(), { recursive: true });
  await writeFile(getSettingsPath(), serializeSettings(next), 'utf8');

  return toSafeSettings(next);
}

export async function readHackmdApiToken() {
  const settings = await readStoredSettings();
  const token = settings.hackmdApiToken.trim();

  if (!token) {
    throw new Error('HackMD API token is not configured. Please add it in Settings.');
  }

  return token;
}
