import type { AppearanceSettings, OnboardingSettings } from '@/lib/settings';

export type WorkspaceScope =
  | { type: 'personal'; label: string }
  | { type: 'history'; label: string }
  | { type: 'team'; label: string; teamPath: string };

export type CommandPaletteState = {
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
  onboarding?: OnboardingSettings;
};
