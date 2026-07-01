import { useEffect, useMemo, useState } from 'react';

import { useTheme } from '@/components/theme-provider';
import {
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
  typography: ThemeTypography;
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
  changeTypography: (role: keyof ThemeTypography, value: string) => void;
  reset: () => void;
};

export type ThemeAppearanceDraftController = {
  actions: ThemeAppearanceDraftActions;
  draft: ThemeAppearanceDraft;
  seedErrors: Partial<Record<keyof ThemeSeed, string>>;
  showTypography: boolean;
  status: ThemeAppearanceDraftStatus;
  typographyErrors: Record<keyof ThemeTypography, string | null>;
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

function seedInputsEqual(left: ThemeSeedInputs, right: ThemeSeedInputs) {
  return THEME_SEED_FIELDS.every((field) => left[field.key] === right[field.key]);
}

function typographyEqual(left: ThemeTypography, right: ThemeTypography) {
  return left.uiFontStack === right.uiFontStack
    && left.editorFontStack === right.editorFontStack;
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
  const savedSeedInputs = useMemo(() => seedToInputs(customSeed), [customSeed]);
  const [draft, setDraft] = useState<ThemeAppearanceDraft>(() => ({
    mode: theme,
    presetId,
    seedInputs: savedSeedInputs,
    typography,
  }));
  const seedErrors = useMemo(() => getInputErrors(draft.seedInputs), [draft.seedInputs]);
  const typographyErrors = useMemo(() => ({
    uiFontStack: getFontStackError(draft.typography.uiFontStack),
    editorFontStack: getFontStackError(draft.typography.editorFontStack),
  }), [draft.typography.editorFontStack, draft.typography.uiFontStack]);
  const hasErrors = Object.keys(seedErrors).length > 0
    || (showTypography && Boolean(typographyErrors.uiFontStack || typographyErrors.editorFontStack));
  const hasDraftChanges = draft.mode !== theme
    || draft.presetId !== presetId
    || !seedInputsEqual(draft.seedInputs, savedSeedInputs)
    || (showTypography && !typographyEqual(draft.typography, typography));

  useEffect(() => {
    setDraft({
      mode: theme,
      presetId,
      seedInputs: savedSeedInputs,
      typography,
    });
  }, [presetId, savedSeedInputs, theme, typography]);

  const preview = (next: Partial<ThemeAppearanceDraft>) => {
    const nextDraft = { ...draft, ...next };
    const nextTypography = showTypography ? nextDraft.typography : typography;
    const nextSeedErrors = getInputErrors(nextDraft.seedInputs);
    const nextTypographyErrors = [
      getFontStackError(nextTypography.uiFontStack),
      getFontStackError(nextTypography.editorFontStack),
    ];
    if (Object.keys(nextSeedErrors).length > 0 || nextTypographyErrors.some(Boolean)) {
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

  const changeTypography = (role: keyof ThemeTypography, value: string) => {
    const nextTypography = {
      ...draft.typography,
      [role]: value,
    };
    setDraft((current) => ({ ...current, typography: nextTypography }));
    preview({ typography: normalizeThemeTypography(nextTypography) });
  };

  const apply = () => {
    if (hasErrors) {
      return false;
    }

    setAppearance({
      theme: draft.mode,
      presetId: draft.presetId,
      customSeed: normalizeThemeSeed(draft.seedInputs),
      typography: showTypography ? normalizeThemeTypography(draft.typography) : typography,
    });
    return true;
  };

  const cancel = () => {
    cancelPreview();
    setDraft({
      mode: theme,
      presetId,
      seedInputs: savedSeedInputs,
      typography,
    });
  };

  const reset = () => {
    const seedInputs = seedToInputs({});
    const nextTypography = showTypography ? defaultThemeTypography : typography;
    setDraft({
      mode: DEFAULT_THEME_MODE,
      presetId: DEFAULT_THEME_PRESET,
      seedInputs,
      typography: nextTypography,
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
