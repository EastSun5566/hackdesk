import type { ReactNode } from 'react';
import { FolderOpen, Keyboard, Monitor, Settings as SettingsIcon, Shield, Zap } from 'lucide-react';

export const SETTINGS_TITLE_ID = 'settings-title';
export const SETTINGS_PANEL_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';

export type SettingsTab = 'general' | 'editor' | 'appearance' | 'vault' | 'hackmd' | 'advanced';

export const SETTINGS_TABS: {
  id: SettingsTab;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  { id: 'general', label: 'General', description: 'Window title and local app defaults.', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'editor', label: 'Editor', description: 'Choose standard, Vim, or Helix editing.', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', description: 'Theme mode, presets, fonts, and color seeds.', icon: <Monitor className="h-4 w-4" /> },
  { id: 'vault', label: 'Vault', description: 'Manage the local Markdown folder.', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'hackmd', label: 'HackMD', description: 'API token and connection test.', icon: <Shield className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', description: 'Version, updates, and reset actions.', icon: <Zap className="h-4 w-4" /> },
];

export function getSettingsTab(tabId: SettingsTab) {
  return SETTINGS_TABS.find((tab) => tab.id === tabId) ?? SETTINGS_TABS[0];
}
