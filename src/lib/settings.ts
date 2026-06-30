import { z } from 'zod';

import { DEFAULT_TITLE } from '@/constants';
import {
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

export type EditorMode = 'standard' | 'vim' | 'helix';

export type EditorSettings = {
  mode: EditorMode;
};

export const defaultAppearanceSettings: AppearanceSettings = {
  theme: 'system',
  presetId: 'hackmd',
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

const hexColorSchema = z.string().regex(/^#[\da-fA-F]{6}$/);
const customFontStackSchema = z.string().trim().refine((value) => !value || isSafeFontStack(value), {
  message: 'Use comma-separated font family names without CSS functions or declarations.',
});
const typographySettingsSchema = z.object({
  uiFontStack: customFontStackSchema.default(defaultThemeTypography.uiFontStack),
  editorFontStack: customFontStackSchema.default(defaultThemeTypography.editorFontStack),
}).default(defaultThemeTypography).transform((value): ThemeTypography => normalizeThemeTypography(value));

export const appearanceSettingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default(defaultAppearanceSettings.theme),
  presetId: z.enum(['hackmd', 'mono', 'solarized', 'forest', 'catppuccin']).default(defaultAppearanceSettings.presetId),
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
    mode: z.enum(['standard', 'vim', 'helix']).default(defaultEditorSettings.mode),
  }).default(defaultEditorSettings),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: AppSettings = {
  title: DEFAULT_TITLE,
  hackmdApiToken: '',
  appearance: defaultAppearanceSettings,
  onboarding: defaultOnboardingSettings,
  localVault: defaultLocalVaultSettings,
  editor: defaultEditorSettings,
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
