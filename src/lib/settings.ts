import { z } from 'zod';

import { DEFAULT_TITLE } from '@/constants';
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

export const appearanceSettingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default(defaultAppearanceSettings.theme),
  presetId: z.enum(['hackmd-neo', 'hackmd-minimal', 'hackmd-nature', 'solarized', 'catppuccin', 'dracula', 'gruvbox']).default(defaultAppearanceSettings.presetId),
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
};

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
