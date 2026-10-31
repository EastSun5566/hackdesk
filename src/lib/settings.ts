import { z } from 'zod';

import { DEFAULT_TITLE } from '@/constants';
import {
  AI_PROVIDER_IDS,
  MAX_AI_COMMAND_NAME_CHARACTERS,
  MAX_AI_COMMAND_PROMPT_CHARACTERS,
  MAX_AI_CUSTOM_COMMANDS,
  type AiDelivery,
  type AiProviderId,
} from '@/lib/ai';
import { MAX_DICTATION_LOCALE_LENGTH } from '@/lib/dictation';
import { ELECTRON_ACTIONS } from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';
import { isValidCustomShortcutConfig } from '@/lib/keyboard-shortcuts';
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  MAX_EDITOR_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  defaultThemeTypography,
  isSafeFontStack,
  normalizeThemeMode,
  normalizeThemePresetId,
  normalizeThemeSeed,
  normalizeThemeTypography,
  type ThemeMode,
  type ThemePresetId,
  type ThemeSeed,
  type ThemeTypography,
} from '@/lib/themes';

export type AppearanceSettings = {
  theme: ThemeMode;
  presetId: ThemePresetId;
  customSeed: Partial<ThemeSeed>;
  typography: ThemeTypography;
};

export type OnboardingSettings = {
  hackmdTokenSetupDeferred: boolean;
};

export type LocalVaultSettings = {
  path: string | null;
};

export type EditorMode = 'standard' | 'emacs' | 'vim' | 'helix' | 'kakoune';

export type EditorSettings = {
  mode: EditorMode;
};

export type ShortcutSettings = Partial<Record<ElectronActionId, string>>;

export type KeyboardNavigationSettings = {
  characterShortcutsEnabled: boolean;
  /** The line of keys for where focus is, at the bottom of the window. */
  keyHintsVisible: boolean;
};

export type WorkspaceNavigationSettings = {
  pinnedTeamIds: string[] | null;
};

export type AiProviderSettings = {
  /** Off until the user turns it on: the switch is the user's grant to run that CLI. */
  enabled: boolean;
  model: string | null;
  commandPath: string | null;
  /** Claude only: run without ANTHROPIC_API_KEY so the claude.ai sign-in is used. */
  ignoreApiKey: boolean;
};

/** A prompt saved under a name, offered in the ⌘K menu. */
export type AiCustomCommand = {
  id: string;
  name: string;
  prompt: string;
  delivery: AiDelivery;
};

export type AiSettings = {
  providers: Record<AiProviderId, AiProviderSettings>;
  defaultProvider: AiProviderId | null;
  /** Shows the "✦ AI" button after selecting text with the mouse. */
  selectionChip: boolean;
  translateLanguage: string;
  customCommands: AiCustomCommand[];
};

export type DictationSettings = {
  /** Off until the user turns it on in Settings, which is their consent to microphone use. */
  enabled: boolean;
  /** A BCP 47 tag such as zh-TW, or null to follow the system's preferred languages. */
  locale: string | null;
};

export type OfflineSettings = {
  /** Keeps opened HackMD notes on this computer for offline reading and text search. */
  keepHackmdNotes: boolean;
};

export const defaultAppearanceSettings: AppearanceSettings = {
  theme: 'system',
  presetId: 'hackmd-neo',
  customSeed: {},
  typography: defaultThemeTypography,
};

export const defaultOnboardingSettings: OnboardingSettings = {
  hackmdTokenSetupDeferred: false,
};

export const defaultLocalVaultSettings: LocalVaultSettings = {
  path: null,
};

export const defaultEditorSettings: EditorSettings = {
  mode: 'standard',
};

export const defaultShortcutSettings: ShortcutSettings = {};

export const defaultWorkspaceNavigationSettings: WorkspaceNavigationSettings = {
  pinnedTeamIds: null,
};

const defaultAiProviderSettings: AiProviderSettings = { enabled: false, model: null, commandPath: null, ignoreApiKey: false };

export const defaultAiSettings: AiSettings = {
  providers: { codex: defaultAiProviderSettings, claude: defaultAiProviderSettings },
  defaultProvider: null,
  selectionChip: true,
  translateLanguage: 'English',
  customCommands: [],
};

export const defaultOfflineSettings: OfflineSettings = {
  keepHackmdNotes: true,
};

export const defaultDictationSettings: DictationSettings = {
  enabled: false,
  locale: null,
};

const hexColorSchema = z.string().regex(/^#[\da-fA-F]{6}$/);
const customFontStackSchema = z.string().trim().refine((value) => !value || isSafeFontStack(value), {
  message: 'Use comma-separated font family names without CSS functions or declarations.',
});
const typographySettingsSchema = z.object({
  uiFontStack: customFontStackSchema.default(defaultThemeTypography.uiFontStack),
  editorFontStack: customFontStackSchema.default(defaultThemeTypography.editorFontStack),
  uiFontSize: z.number().int().min(MIN_UI_FONT_SIZE).max(MAX_UI_FONT_SIZE).default(DEFAULT_UI_FONT_SIZE),
  editorFontSize: z.number().int().min(MIN_EDITOR_FONT_SIZE).max(MAX_EDITOR_FONT_SIZE).default(DEFAULT_EDITOR_FONT_SIZE),
}).default(defaultThemeTypography).transform((value): ThemeTypography => normalizeThemeTypography(value));
const electronActionIds = new Set<ElectronActionId>(ELECTRON_ACTIONS.map((action) => action.id));
const shortcutConfigSchema = z.string().trim().refine(isValidCustomShortcutConfig, {
  message: 'Use a modifier-based shortcut that is not reserved by the editor or operating system.',
});
const shortcutSettingsSchema = z.record(z.string(), shortcutConfigSchema)
  .default(defaultShortcutSettings)
  .transform((value): ShortcutSettings => {
    const shortcuts: ShortcutSettings = {};
    for (const [actionId, shortcut] of Object.entries(value)) {
      if (!electronActionIds.has(actionId as ElectronActionId)) {
        throw new Error(`Unknown shortcut action: ${actionId}`);
      }
      shortcuts[actionId as ElectronActionId] = shortcut;
    }
    return shortcuts;
  });
const aiProviderSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  model: z.string().trim().min(1).max(200).nullable().default(null),
  commandPath: z.string().trim().min(1).max(4096).nullable().default(null),
  ignoreApiKey: z.boolean().default(false),
}).default(defaultAiProviderSettings);
export const aiCustomCommandSchema = z.object({
  // Saving requires a UUID, so an entry without one is dropped here instead of breaking every save.
  id: z.uuid(),
  name: z.string().trim().min(1).max(MAX_AI_COMMAND_NAME_CHARACTERS),
  prompt: z.string().trim().min(1).max(MAX_AI_COMMAND_PROMPT_CHARACTERS),
  delivery: z.enum(['replace', 'insert-below']),
});
/**
 * One damaged command is dropped on its own: failing the whole list would reset the `ai` section,
 * and with it the provider switches.
 */
const aiCustomCommandsSchema = z.array(z.unknown()).default([]).transform((items): AiCustomCommand[] => {
  const seen = new Set<string>();
  const commands: AiCustomCommand[] = [];
  for (const item of items) {
    const result = aiCustomCommandSchema.safeParse(item);
    if (!result.success || seen.has(result.data.id)) continue;
    seen.add(result.data.id);
    commands.push(result.data);
  }
  return commands.slice(0, MAX_AI_CUSTOM_COMMANDS);
});
const aiSettingsSchema = z.object({
  providers: z.object({
    codex: aiProviderSettingsSchema,
    claude: aiProviderSettingsSchema,
  }).default(defaultAiSettings.providers),
  defaultProvider: z.enum(AI_PROVIDER_IDS).nullable().default(null),
  selectionChip: z.boolean().default(true),
  translateLanguage: z.string().trim().min(1).max(64).default('English'),
  customCommands: aiCustomCommandsSchema,
}).default(defaultAiSettings);
const offlineSettingsSchema = z.object({
  keepHackmdNotes: z.boolean().default(true),
}).default(defaultOfflineSettings);
const dictationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  locale: z.string().trim().min(1).max(MAX_DICTATION_LOCALE_LENGTH).nullable().default(null),
}).default(defaultDictationSettings);
const pinnedTeamIdsSchema = z.array(z.string().trim().min(1)).nullable().refine(
  (teamIds) => teamIds === null || new Set(teamIds).size === teamIds.length,
  'Pinned team IDs must be unique.',
);

export const appearanceSettingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default(defaultAppearanceSettings.theme),
  presetId: z.enum(['hackmd-neo', 'solarized', 'catppuccin', 'dracula', 'gruvbox', 'noctis']).default(defaultAppearanceSettings.presetId),
  customSeed: z.object({
    neutral: hexColorSchema.optional(),
    primary: hexColorSchema.optional(),
    success: hexColorSchema.optional(),
    warning: hexColorSchema.optional(),
    destructive: hexColorSchema.optional(),
  }).default(defaultAppearanceSettings.customSeed),
  typography: typographySettingsSchema,
}).default(defaultAppearanceSettings).transform((value): AppearanceSettings => ({
  theme: normalizeThemeMode(value.theme, defaultAppearanceSettings.theme),
  presetId: normalizeThemePresetId(value.presetId, defaultAppearanceSettings.presetId),
  customSeed: normalizeThemeSeed(value.customSeed),
  typography: normalizeThemeTypography(value.typography),
}));

export const settingsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(50, 'Title too long'),
  hackmdApiToken: z.string().trim().default(''),
  appearance: appearanceSettingsSchema,
  onboarding: z.object({
    hackmdTokenSetupDeferred: z.boolean().default(defaultOnboardingSettings.hackmdTokenSetupDeferred),
  }).default(defaultOnboardingSettings),
  localVault: z.object({
    path: z.string().trim().min(1).nullable().default(defaultLocalVaultSettings.path),
  }).default(defaultLocalVaultSettings),
  editor: z.object({
    mode: z.enum(['standard', 'emacs', 'vim', 'helix', 'kakoune']).default(defaultEditorSettings.mode),
  }).default(defaultEditorSettings),
  shortcuts: shortcutSettingsSchema,
  keyboardNavigation: z.object({
    characterShortcutsEnabled: z.boolean().default(true),
    keyHintsVisible: z.boolean().default(true),
  }).default({ characterShortcutsEnabled: true, keyHintsVisible: true }),
  workspaceNavigation: z.object({
    pinnedTeamIds: pinnedTeamIdsSchema.default(null),
  }).default(defaultWorkspaceNavigationSettings),
  ai: aiSettingsSchema,
  dictation: dictationSettingsSchema,
  offline: offlineSettingsSchema,
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: AppSettings = {
  title: DEFAULT_TITLE,
  hackmdApiToken: '',
  appearance: defaultAppearanceSettings,
  onboarding: defaultOnboardingSettings,
  localVault: defaultLocalVaultSettings,
  editor: defaultEditorSettings,
  shortcuts: defaultShortcutSettings,
  keyboardNavigation: { characterShortcutsEnabled: true, keyHintsVisible: true },
  workspaceNavigation: defaultWorkspaceNavigationSettings,
  ai: defaultAiSettings,
  dictation: defaultDictationSettings,
  offline: defaultOfflineSettings,
};

const storedShortcutSettingsSchema = z.record(z.string(), z.unknown())
  .catch({})
  .transform((value): ShortcutSettings => {
    const shortcuts: ShortcutSettings = {};
    for (const [actionId, shortcut] of Object.entries(value)) {
      if (!electronActionIds.has(actionId as ElectronActionId)) {
        continue;
      }
      const result = shortcutConfigSchema.safeParse(shortcut);
      if (result.success) {
        shortcuts[actionId as ElectronActionId] = result.data;
      }
    }
    return shortcuts;
  });

const storedSettingsSchema = z.object({
  title: settingsSchema.shape.title.catch(defaultSettings.title),
  hackmdApiToken: settingsSchema.shape.hackmdApiToken.catch(defaultSettings.hackmdApiToken),
  appearance: settingsSchema.shape.appearance.catch(defaultSettings.appearance),
  onboarding: settingsSchema.shape.onboarding.catch(defaultSettings.onboarding),
  localVault: settingsSchema.shape.localVault.catch(defaultSettings.localVault),
  editor: settingsSchema.shape.editor.catch(defaultSettings.editor),
  shortcuts: storedShortcutSettingsSchema.default(defaultSettings.shortcuts),
  keyboardNavigation: settingsSchema.shape.keyboardNavigation.catch(defaultSettings.keyboardNavigation),
  workspaceNavigation: settingsSchema.shape.workspaceNavigation.catch(defaultSettings.workspaceNavigation),
  ai: settingsSchema.shape.ai.catch(defaultSettings.ai),
  dictation: settingsSchema.shape.dictation.catch(defaultSettings.dictation),
  offline: settingsSchema.shape.offline.catch(defaultSettings.offline),
});

export function normalizeAppearanceSettings(
  appearance: unknown,
  fallback: AppearanceSettings = defaultAppearanceSettings,
): AppearanceSettings {
  const result = appearanceSettingsSchema.safeParse(appearance);

  if (!result.success) {
    return fallback;
  }

  return result.data;
}

function getSettingsError(error: unknown) {
  if (error instanceof z.ZodError) {
    return new Error(error.issues[0]?.message ?? 'Invalid settings');
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Invalid settings');
}

export function validateSettings(settings: unknown): AppSettings {
  const result = settingsSchema.safeParse(settings);

  if (!result.success) {
    throw getSettingsError(result.error);
  }

  return result.data;
}

export function parseSettings(content: string): AppSettings {
  try {
    return validateSettings(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format');
    }

    throw getSettingsError(error);
  }
}

export function parseStoredSettings(content: string): AppSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format');
    }
    throw getSettingsError(error);
  }

  const result = storedSettingsSchema.safeParse(parsed);
  if (!result.success) {
    throw getSettingsError(result.error);
  }
  return result.data;
}

export function parseSettingsOrDefault(
  content?: string | null,
  fallback: AppSettings = defaultSettings,
  onError?: (error: Error) => void,
): AppSettings {
  if (!content) {
    return fallback;
  }

  try {
    return parseSettings(content);
  } catch (error) {
    onError?.(getSettingsError(error));
    return fallback;
  }
}

export function serializeSettings(settings: AppSettings) {
  return JSON.stringify(validateSettings(settings), null, 2);
}
