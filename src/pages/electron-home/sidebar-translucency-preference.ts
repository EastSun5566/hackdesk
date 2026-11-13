import { useSyncExternalStore } from 'react';

import { getHackDeskAPI } from '@/lib/electron-api';
import { trySetStorageItem } from '@/lib/storage';
import { isWindowTranslucency, WINDOW_TRANSLUCENCY_LEVELS, type WindowTranslucency } from '@/lib/window-translucency';

/**
 * How much of the desktop shows through the window frame and sidebar (macOS only, where the window
 * has a vibrancy material behind it; see src/lib/window-translucency.ts). Off by default; kept on
 * this computer. Notes stay opaque.
 */
export const SIDEBAR_TRANSLUCENCY_KEY = 'hackdesk_sidebar_translucency';

export const SIDEBAR_TRANSLUCENCY_LEVELS = WINDOW_TRANSLUCENCY_LEVELS;
export type SidebarTranslucency = WindowTranslucency;

export const SIDEBAR_TRANSLUCENCY_LABELS: Record<SidebarTranslucency, string> = {
  off: 'Off',
  subtle: 'Subtle',
  medium: 'Medium',
  clear: 'Clear',
};

export const isSidebarTranslucency = isWindowTranslucency;

const listeners = new Set<() => void>();

export function readSidebarTranslucency(): SidebarTranslucency {
  if (typeof window === 'undefined') return 'off';
  try {
    const stored = window.localStorage.getItem(SIDEBAR_TRANSLUCENCY_KEY);
    return isSidebarTranslucency(stored) ? stored : 'off';
  } catch {
    return 'off';
  }
}

/**
 * The page clears its frame through a root attribute (see styles.css), and the main process picks
 * the window material for the level and keeps the window itself transparent. The level only takes
 * effect alongside data-window-vibrancy, which the app sets where the window has a material.
 */
export function applySidebarTranslucency(level = readSidebarTranslucency()) {
  if (typeof document === 'undefined') return;
  if (level === 'off') delete document.documentElement.dataset.sidebarTranslucency;
  else document.documentElement.dataset.sidebarTranslucency = level;
  void getHackDeskAPI()?.app.setWindowTranslucency?.(level);
}

/** Marks the window as having a vibrancy material behind it (macOS), which translucency needs. */
export function applyWindowVibrancy(platform: string) {
  if (typeof document === 'undefined') return;
  if (platform === 'darwin') document.documentElement.dataset.windowVibrancy = '';
  else delete document.documentElement.dataset.windowVibrancy;
}

export function setSidebarTranslucency(level: SidebarTranslucency) {
  trySetStorageItem(window.localStorage, SIDEBAR_TRANSLUCENCY_KEY, level);
  applySidebarTranslucency(level);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidebarTranslucency() {
  return useSyncExternalStore(subscribe, readSidebarTranslucency, () => 'off' as const);
}
