import { useEffect, useMemo, useState } from 'react';

import { useTheme } from '@/components/theme-provider';
import {
  MAX_EDITOR_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  defaultThemeTypography,
  isSafeFontStack,
  normalizeThemeSeed,
  normalizeThemeTypography,
  type ThemeMode,
  type ThemePresetId,
  type ThemeSeed,
  type ThemeTypography,
} from '@/lib/themes';

export type ThemeSeedInputs = Record<keyof ThemeSeed, string>;
export type ThemeTypographyInputs = Record<keyof ThemeTypography, string>;

export const THEME_SEED_FIELDS: { key: keyof ThemeSeed; label: string }[] = [
  { key: 'neutral', label: 'Neutral' },
  { key: 'primary', label: 'Primary' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'destructive', label: 'Danger' },
];

const HEX_COLOR_RE = /^#[\da-fA-F]{6}$/;
const DEFAULT_THEME_MODE: ThemeMode = 'system';
const DEFAULT_THEME_PRESET: ThemePresetId = 'hackmd-neo';
const FONT_STACK_ERROR = 'Use comma-separated font family names. CSS functions and declarations are not allowed.';

type ThemeAppearanceDraft = {
  mode: ThemeMode;
  presetId: ThemePresetId;
  seedInputs: ThemeSeedInputs;
  typography: ThemeTypographyInputs;
};

type ThemeAppearanceDraftStatus = {
  canApply: boolean;
  hasDraftChanges: boolean;
  hasErrors: boolean;
};

type ThemeAppearanceDraftActions = {
  apply: () => boolean;
  cancel: () => void;
  changeMode: (mode: ThemeMode) => void;
  changePreset: (presetId: ThemePresetId) => void;
  changeSeed: (key: keyof ThemeSeed, value: string) => void;
  changeTypography: (role: keyof ThemeTypographyInputs, value: string) => void;
  reset: () => void;
};

export type ThemeAppearanceDraftController = {
  actions: ThemeAppearanceDraftActions;
  draft: ThemeAppearanceDraft;
  seedErrors: Partial<Record<keyof ThemeSeed, string>>;
  showTypography: boolean;
  status: ThemeAppearanceDraftStatus;
  typographyErrors: Record<keyof ThemeTypographyInputs, string | null>;
};

function seedToInputs(seed: Partial<ThemeSeed>) {
  return THEME_SEED_FIELDS.reduce<ThemeSeedInputs>((acc, field) => {
    acc[field.key] = seed[field.key] ?? '';
    return acc;
  }, {
    neutral: '',
    primary: '',
    success: '',
    warning: '',
    destructive: '',
  });
}

function getInputErrors(inputs: ThemeSeedInputs) {
  return THEME_SEED_FIELDS.reduce<Partial<Record<keyof ThemeSeed, string>>>((acc, field) => {
    const value = inputs[field.key].trim();
    if (value && !HEX_COLOR_RE.test(value)) {
      acc[field.key] = 'Use a 6-digit hex color, for example #5D54E8.';
    }
    return acc;
  }, {});
}

function getFontStackError(value: string) {
  return value.trim() && !isSafeFontStack(value) ? FONT_STACK_ERROR : null;
}

function getFontSizeError(value: string, min: number, max: number) {
  const parsed = Number(value);
  return value.trim() && Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? null
    : `Enter a whole number from ${min} to ${max}.`;
}

function typographyToInputs(typography: ThemeTypography): ThemeTypographyInputs {
  return {
    uiFontStack: typography.uiFontStack,
    editorFontStack: typography.editorFontStack,
    uiFontSize: String(typography.uiFontSize),
    editorFontSize: String(typography.editorFontSize),
  };
}

function getTypographyErrors(typography: ThemeTypographyInputs) {
  return {
    uiFontStack: getFontStackError(typography.uiFontStack),
    editorFontStack: getFontStackError(typography.editorFontStack),
    uiFontSize: getFontSizeError(typography.uiFontSize, MIN_UI_FONT_SIZE, MAX_UI_FONT_SIZE),
    editorFontSize: getFontSizeError(typography.editorFontSize, MIN_EDITOR_FONT_SIZE, MAX_EDITOR_FONT_SIZE),
  };
}

function parseTypographyInputs(typography: ThemeTypographyInputs): ThemeTypography | null {
  if (Object.values(getTypographyErrors(typography)).some(Boolean)) {
    return null;
  }

  return normalizeThemeTypography({
    ...typography,
    uiFontSize: Number(typography.uiFontSize),
    editorFontSize: Number(typography.editorFontSize),
  });
}

function seedInputsEqual(left: ThemeSeedInputs, right: ThemeSeedInputs) {
  return THEME_SEED_FIELDS.every((field) => left[field.key] === right[field.key]);
}

function typographyInputsEqual(left: ThemeTypographyInputs, right: ThemeTypographyInputs) {
  return left.uiFontStack === right.uiFontStack
    && left.editorFontStack === right.editorFontStack
    && left.uiFontSize === right.uiFontSize
    && left.editorFontSize === right.editorFontSize;
}

export function useThemeAppearanceDraft({
  showTypography = false,
}: {
  showTypography?: boolean;
} = {}): ThemeAppearanceDraftController {
  const {
    theme,
    presetId,
    customSeed,
    typography: contextTypography,
    previewTheme,
    cancelPreview,
    setAppearance,
  } = useTheme();
  const typography = useMemo(() => normalizeThemeTypography(contextTypography), [contextTypography]);
  const savedTypographyInputs = useMemo(() => typographyToInputs(typography), [typography]);
  const savedSeedInputs = useMemo(() => seedToInputs(customSeed), [customSeed]);
  const [draft, setDraft] = useState<ThemeAppearanceDraft>(() => ({
    mode: theme,
    presetId,
    seedInputs: savedSeedInputs,
    typography: savedTypographyInputs,
  }));
  const seedErrors = useMemo(() => getInputErrors(draft.seedInputs), [draft.seedInputs]);
  const typographyErrors = useMemo(() => getTypographyErrors(draft.typography), [draft.typography]);
  const hasErrors = Object.keys(seedErrors).length > 0
    || (showTypography && Object.values(typographyErrors).some(Boolean));
  const hasDraftChanges = draft.mode !== theme
    || draft.presetId !== presetId
    || !seedInputsEqual(draft.seedInputs, savedSeedInputs)
    || (showTypography && !typographyInputsEqual(draft.typography, savedTypographyInputs));

  useEffect(() => {
    setDraft({
      mode: theme,
      presetId,
      seedInputs: savedSeedInputs,
      typography: savedTypographyInputs,
    });
  }, [presetId, savedSeedInputs, savedTypographyInputs, theme]);

  const preview = (next: Partial<ThemeAppearanceDraft>) => {
    const nextDraft = { ...draft, ...next };
    const nextTypography = showTypography ? parseTypographyInputs(nextDraft.typography) : typography;
    const nextSeedErrors = getInputErrors(nextDraft.seedInputs);
    if (Object.keys(nextSeedErrors).length > 0 || !nextTypography) {
      return;
    }

    previewTheme({
      theme: nextDraft.mode,
      presetId: nextDraft.presetId,
      customSeed: normalizeThemeSeed(nextDraft.seedInputs),
      typography: nextTypography,
    });
  };

  const changeMode = (mode: ThemeMode) => {
    setDraft((current) => ({ ...current, mode }));
    preview({ mode });
  };

  const changePreset = (nextPresetId: ThemePresetId) => {
    setDraft((current) => ({ ...current, presetId: nextPresetId }));
    preview({ presetId: nextPresetId });
  };

  const changeSeed = (key: keyof ThemeSeed, value: string) => {
    const seedInputs = { ...draft.seedInputs, [key]: value };
    setDraft((current) => ({ ...current, seedInputs }));
    preview({ seedInputs });
  };

  const changeTypography = (role: keyof ThemeTypographyInputs, value: string) => {
    const nextTypography = {
      ...draft.typography,
      [role]: value,
    };
    setDraft((current) => ({ ...current, typography: nextTypography }));
    preview({ typography: nextTypography });
  };

  const apply = () => {
    if (hasErrors) {
      return false;
    }

    const nextTypography = showTypography ? parseTypographyInputs(draft.typography) : typography;
    if (!nextTypography) {
      return false;
    }

    setAppearance({
      theme: draft.mode,
      presetId: draft.presetId,
      customSeed: normalizeThemeSeed(draft.seedInputs),
      typography: nextTypography,
    });
    return true;
  };

  const cancel = () => {
    cancelPreview();
    setDraft({
      mode: theme,
      presetId,
      seedInputs: savedSeedInputs,
      typography: savedTypographyInputs,
    });
  };

  const reset = () => {
    const seedInputs = seedToInputs({});
    const nextTypography = showTypography ? defaultThemeTypography : typography;
    setDraft({
      mode: DEFAULT_THEME_MODE,
      presetId: DEFAULT_THEME_PRESET,
      seedInputs,
      typography: typographyToInputs(nextTypography),
    });
    previewTheme({
      theme: DEFAULT_THEME_MODE,
      presetId: DEFAULT_THEME_PRESET,
      customSeed: {},
      typography: nextTypography,
    });
  };

  return {
    actions: {
      apply,
      cancel,
      changeMode,
      changePreset,
      changeSeed,
      changeTypography,
      reset,
    },
    draft,
    seedErrors,
    showTypography,
    status: {
      canApply: !hasErrors,
      hasDraftChanges,
      hasErrors,
    },
    typographyErrors,
  };
}
