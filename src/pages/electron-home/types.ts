import type { AppIconId } from '@/lib/app-icons';
import type {
  AppearanceSettings,
  EditorSettings,
  OnboardingSettings,
  ShortcutSettings,
  KeyboardNavigationSettings,
  QuickCaptureSettings,
  WorkspaceNavigationSettings,
} from '@/lib/settings';

export type WorkspaceScope =
  /** workspaceId is set while the folder is open as part of a named set: the set owns the tabs. */
  | { type: 'local'; label: string; vaultId?: string; workspaceId?: string }
  | { type: 'personal'; label: string }
  | { type: 'history'; label: string }
  | { type: 'team'; label: string; teamPath: string };

export type CommandPaletteState = {
  /** move-note lists folders for the selected note instead of searching. */
  mode: 'commands' | 'quick-open' | 'move-note' | 'move-folder' | 'choose-note-folder';
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
  hackmdAccountLabel?: string;
  hackmdAddAccount?: boolean;
  hackmdActiveAccountId?: string;
  hackmdRemoveAccountId?: string;
  appearance?: AppearanceSettings;
  editor?: EditorSettings;
  shortcuts?: ShortcutSettings;
  keyboardNavigation?: KeyboardNavigationSettings;
  onboarding?: OnboardingSettings;
  workspaceNavigation?: WorkspaceNavigationSettings;
  /** Only the settings given change; Keep open and the pin shortcut save from different tabs. */
  quickCapture?: Partial<QuickCaptureSettings>;
  appIcon?: AppIconId;
};
