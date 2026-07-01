import type { ReactNode } from 'react';
import { FolderOpen, Keyboard, Monitor, Settings as SettingsIcon, Shield, Zap } from 'lucide-react';

export const SETTINGS_TITLE_ID = 'settings-title';
export const SETTINGS_PANEL_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';

export type SettingsTab = 'general' | 'editor' | 'appearance' | 'vault' | 'hackmd' | 'advanced';

export const SETTINGS_TABS: {
  id: SettingsTab;
  label: string;
  icon: ReactNode;
}[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'editor', label: 'Editor', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Monitor className="h-4 w-4" /> },
  { id: 'vault', label: 'Vault', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'hackmd', label: 'HackMD', icon: <Shield className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', icon: <Zap className="h-4 w-4" /> },
];
