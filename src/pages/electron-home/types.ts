import type { AppearanceSettings, EditorSettings, OnboardingSettings, ShortcutSettings } from '@/lib/settings';

export type WorkspaceScope =
  | { type: 'local'; label: string }
  | { type: 'personal'; label: string }
  | { type: 'history'; label: string }
  | { type: 'team'; label: string; teamPath: string };

export type CommandPaletteState = {
  mode: 'commands' | 'quick-open';
  open: boolean;
  search: string;
};

export type CreateNoteDialogState = {
  open: boolean;
  title: string;
};

export type CreateFolderDialogState = {
  open: boolean;
  name: string;
  description: string;
  icon: string;
  color: string;
};

export type RenameFolderDialogState = {
  open: boolean;
  folderId: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
};

export type SettingsFormInput = {
  title: string;
  hackmdApiToken?: string;
  appearance?: AppearanceSettings;
  editor?: EditorSettings;
  shortcuts?: ShortcutSettings;
  onboarding?: OnboardingSettings;
};
