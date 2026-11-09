import type { ReactNode } from 'react';
import { Command, FolderOpen, Keyboard, Mic, Monitor, Settings as SettingsIcon, Shield, Sparkles, Zap } from 'lucide-react';

export const SETTINGS_TITLE_ID = 'settings-title';
export const SETTINGS_PANEL_CLASS = 'scroll-edges-source min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8 pl-8 pr-8 pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';

export type SettingsTab = 'general' | 'editor' | 'shortcuts' | 'appearance' | 'vault' | 'hackmd' | 'ai' | 'dictation' | 'advanced';

export const SETTINGS_TABS: {
  id: SettingsTab;
  label: string;
  /** The page heading, when it says more than the sidebar label. */
  heading?: string;
  icon: ReactNode;
}[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'editor', label: 'Editor', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Command className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Monitor className="h-4 w-4" /> },
  { id: 'vault', label: 'Vault', heading: 'Local Vault', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'hackmd', label: 'HackMD', icon: <Shield className="h-4 w-4" /> },
  { id: 'ai', label: 'AI (Experimental)', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'dictation', label: 'Dictation (Experimental)', icon: <Mic className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', icon: <Zap className="h-4 w-4" /> },
];
