import { homeDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ROOT, SETTINGS_NAME } from './constants';

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

export async function readSettings() {
  try {
    return await readTextFile(await getSettingsPath());
  } catch (error) {
    console.error('Failed to read settings:', error);
    return null;
  }
}

export async function writeSettings(content: string) {
  try {
    const setting = await getSettingsPath();
    await writeTextFile(setting, content);
  } catch (error) {
    console.error('Failed to write settings:', error);
    throw error;
  }
}