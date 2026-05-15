import { invoke } from '@tauri-apps/api/core';

import { Cmd } from '@/constants';

const SETTINGS_LAUNCH_TAB_STORAGE_KEY = 'hackdesk_settings_launch_tab';
const VALID_SETTINGS_TABS = ['general', 'appearance', 'hackmd', 'agent', 'shortcuts', 'advanced'] as const;

export type SettingsLaunchTab = typeof VALID_SETTINGS_TABS[number];

function isValidSettingsTab(value: unknown): value is SettingsLaunchTab {
  return typeof value === 'string' && VALID_SETTINGS_TABS.includes(value as SettingsLaunchTab);
}

export function setPendingSettingsLaunchTab(
  tab: SettingsLaunchTab,
  storage: Storage = window.localStorage,
) {
  storage.setItem(SETTINGS_LAUNCH_TAB_STORAGE_KEY, tab);
}

export function consumePendingSettingsLaunchTab(
  storage: Storage = window.localStorage,
): SettingsLaunchTab | null {
  const value = storage.getItem(SETTINGS_LAUNCH_TAB_STORAGE_KEY);
  storage.removeItem(SETTINGS_LAUNCH_TAB_STORAGE_KEY);

  return isValidSettingsTab(value) ? value : null;
}

export async function openSettingsWindow(
  tab?: SettingsLaunchTab,
  storage: Storage = window.localStorage,
) {
  if (tab) {
    setPendingSettingsLaunchTab(tab, storage);
  }

  await invoke(Cmd.OPEN_SETTINGS_WINDOW);
}
