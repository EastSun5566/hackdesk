import type { AppIconId } from '@/lib/app-icons';
import type { NoteSummary } from '@/lib/electron-api';
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

/** What the folder picker acts on: the note or folder being moved, or New Note's title while its location is chosen. */
export type FolderPickerTarget =
  | { type: 'note'; note: NoteSummary }
  | { type: 'folder'; id: string }
  | { type: 'create'; title: string };

export type CommandPaletteState = {
  /** move-note lists folders for the selected note instead of searching. */
  mode: 'commands' | 'quick-open' | 'move-note' | 'move-folder' | 'choose-note-folder';
  open: boolean;
  search: string;
  /** Set while the folder picker acts on something other than the selected note; cleared with the palette. */
  target?: FolderPickerTarget;
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
