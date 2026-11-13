import { useSyncExternalStore } from 'react';

import { trySetStorageItem } from '@/lib/storage';

/**
 * How much of the desktop shows through the window frame and sidebar (macOS only, where the window
 * has a vibrancy material behind it). Off by default; kept on this computer. Notes stay opaque.
 */
export const SIDEBAR_TRANSLUCENCY_KEY = 'hackdesk_sidebar_translucency';

export const SIDEBAR_TRANSLUCENCY_LEVELS = ['off', 'subtle', 'medium', 'clear'] as const;
export type SidebarTranslucency = (typeof SIDEBAR_TRANSLUCENCY_LEVELS)[number];

export const SIDEBAR_TRANSLUCENCY_LABELS: Record<SidebarTranslucency, string> = {
  off: 'Off',
  subtle: 'Subtle',
  medium: 'Medium',
  clear: 'Clear',
};

export function isSidebarTranslucency(value: unknown): value is SidebarTranslucency {
  return typeof value === 'string' && (SIDEBAR_TRANSLUCENCY_LEVELS as readonly string[]).includes(value);
}

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
 * Keyed on the root element (see styles.css), so a change never re-renders the app. The level only
 * takes effect alongside data-window-vibrancy, which the app sets where the window has a material.
 */
export function applySidebarTranslucency(level = readSidebarTranslucency()) {
  if (typeof document === 'undefined') return;
  if (level === 'off') delete document.documentElement.dataset.sidebarTranslucency;
  else document.documentElement.dataset.sidebarTranslucency = level;
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
