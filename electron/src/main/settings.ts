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

function toSafeSettings(settings: AppSettings): ElectronSafeSettings {
  return {
    title: settings.title,
    hasHackmdApiToken: settings.hackmdApiToken.trim().length > 0,
  };
}

export async function readStoredSettings(): Promise<AppSettings> {
  try {
    const content = await readFile(getSettingsPath(), 'utf8');
    return parseSettingsOrDefault(content, defaultSettings);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return defaultSettings;
    }

    throw error;
  }
}

export async function getSafeSettings(): Promise<ElectronSafeSettings> {
  return toSafeSettings(await readStoredSettings());
}

export async function updateStoredSettings(update: ElectronSettingsUpdate): Promise<ElectronSafeSettings> {
  const current = await readStoredSettings();
  const next = validateSettings({
    title: update.title,
    hackmdApiToken: update.hackmdApiToken ?? current.hackmdApiToken,
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
