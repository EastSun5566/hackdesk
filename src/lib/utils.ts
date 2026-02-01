import { homeDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DEFAULT_TITLE, ROOT, SETTINGS_NAME } from '../constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounce<Params extends unknown[]>(
  fn: (...args: Params) => unknown,
  timeout: number,
): (...args: Params) => void {
  let timer: NodeJS.Timeout;
  return (...args: Params) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, timeout);
  };
}


export async function getSettingsPath() {
  const home = await homeDir();
  return join(home, ROOT, SETTINGS_NAME);
}

export async function readSettings(): Promise<string> {
  try {
    return await readTextFile(await getSettingsPath());
  } catch (error) {
    // If file doesn't exist, return default settings
    if (error instanceof Error && error.message.includes('No such file')) {
      console.warn('Settings file not found, using defaults');
      return JSON.stringify({ title: DEFAULT_TITLE });
    }
    throw new Error(`Failed to read settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function writeSettings(content: string): Promise<void> {
  try {
    await writeTextFile(await getSettingsPath(), content);
  } catch (error) {
    throw new Error(`Failed to write settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}