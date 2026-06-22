export type ThemeMode = 'dark' | 'light' | 'system';

export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export type ThemePresetId = 'hackmd' | 'mono' | 'solarized' | 'forest';

export type ThemeSeed = {
  neutral: string;
  primary: string;
  success: string;
  warning: string;
  destructive: string;
};

export type ResolvedHackDeskTheme = Record<string, string>;

export type ThemePreset = {
  id: ThemePresetId;
  name: string;
  description: string;
  light: ThemeSeed;
  dark: ThemeSeed;
};

export const THEME_STYLE_ID = 'hackdesk-theme';
export const THEME_PRELOAD_STYLE_ID = 'hackdesk-theme-preload';

export const THEME_STORAGE_KEYS = {
  mode: 'theme-mode',
  legacyMode: 'theme',
  presetId: 'theme-preset-id',
  customSeed: 'theme-custom-seed',
  cachedCss: 'hackdesk-theme-css',
} as const;

const HEX_COLOR_RE = /^#[\da-f]{6}$/i;

export const HACKDESK_THEME_PRESETS: ThemePreset[] = [
  {
    id: 'hackmd',
    name: 'HackMD',
    description: 'The default HackDesk palette.',
    light: {
      neutral: '#71717A',
      primary: '#5D54E8',
      success: '#22C55E',
      warning: '#F59E0B',
      destructive: '#EF4444',
    },
    dark: {
      neutral: '#71717A',
      primary: '#A8A2FF',
      success: '#22C55E',
      warning: '#FBBF24',
      destructive: '#F87171',
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Low-chroma writing surface.',
    light: {
      neutral: '#6B7280',
      primary: '#374151',
      success: '#16A34A',
      warning: '#D97706',
      destructive: '#DC2626',
    },
    dark: {
      neutral: '#9CA3AF',
      primary: '#E5E7EB',
      success: '#4ADE80',
      warning: '#FBBF24',
      destructive: '#F87171',
    },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    description: 'Warm paper with blue accents.',
    light: {
      neutral: '#839496',
      primary: '#268BD2',
      success: '#859900',
      warning: '#B58900',
      destructive: '#DC322F',
    },
    dark: {
      neutral: '#93A1A1',
      primary: '#2AA198',
      success: '#859900',
      warning: '#CB4B16',
      destructive: '#DC322F',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Green accent for long-form notes.',
    light: {
      neutral: '#6B7280',
      primary: '#15803D',
      success: '#16A34A',
      warning: '#CA8A04',
      destructive: '#DC2626',
    },
    dark: {
      neutral: '#94A3B8',
      primary: '#4ADE80',
      success: '#22C55E',
      warning: '#EAB308',
      destructive: '#FB7185',
    },
  },
];

const THEME_PRESET_BY_ID = new Map(HACKDESK_THEME_PRESETS.map((preset) => [preset.id, preset]));

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === 'string' && THEME_PRESET_BY_ID.has(value as ThemePresetId);
}

export function normalizeThemeMode(value: unknown, fallback: ThemeMode = 'system'): ThemeMode {
  return isThemeMode(value) ? value : fallback;
}

export function normalizeThemePresetId(value: unknown, fallback: ThemePresetId = 'hackmd'): ThemePresetId {
  return isThemePresetId(value) ? value : fallback;
}

export function getThemePreset(id: ThemePresetId): ThemePreset {
  return THEME_PRESET_BY_ID.get(id) ?? HACKDESK_THEME_PRESETS[0];
}

export function normalizeThemeSeed(value: unknown): Partial<ThemeSeed> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const candidate = value as Partial<Record<keyof ThemeSeed, unknown>>;
  return {
    ...(isHexColor(candidate.neutral) ? { neutral: normalizeHex(candidate.neutral) } : {}),
    ...(isHexColor(candidate.primary) ? { primary: normalizeHex(candidate.primary) } : {}),
    ...(isHexColor(candidate.success) ? { success: normalizeHex(candidate.success) } : {}),
    ...(isHexColor(candidate.warning) ? { warning: normalizeHex(candidate.warning) } : {}),
    ...(isHexColor(candidate.destructive) ? { destructive: normalizeHex(candidate.destructive) } : {}),
  };
}

export function parseStoredThemeSeed(value: string | null): Partial<ThemeSeed> {
  if (!value) {
    return {};
  }

  try {
    return normalizeThemeSeed(JSON.parse(value));
  } catch {
    return {};
  }
}

export function serializeThemeSeed(seed: Partial<ThemeSeed>) {
  return JSON.stringify(normalizeThemeSeed(seed));
}

export function resolveHackDeskTheme({
  presetId,
  mode,
  customSeed,
}: {
  presetId: ThemePresetId;
  mode: ResolvedThemeMode;
  customSeed?: Partial<ThemeSeed>;
}): ResolvedHackDeskTheme {
  const preset = getThemePreset(presetId);
  const baseSeed = mode === 'dark' ? preset.dark : preset.light;
  const seed = {
    ...baseSeed,
    ...normalizeThemeSeed(customSeed),
  };
  const dark = mode === 'dark';
  const neutral = seed.neutral;
  const primary = seed.primary;
  const success = seed.success;
  const warning = seed.warning;
  const destructive = seed.destructive;

  return dark
    ? {
        '--text-default': mix(neutral, '#FFFFFF', 72),
        '--text-subtle': mix(neutral, '#FFFFFF', 48),
        '--background-default': mix(neutral, '#000000', 34),
        '--background-muted': mix(neutral, '#000000', 25),
        '--background-overlay': 'rgb(0 0 0 / 0.7)',
        '--background-selected': alpha(primary, 0.28),
        '--border-default': alpha(neutral, 0.46),
        '--border-bold': mix(neutral, '#FFFFFF', 54),
        '--primary-default': primary,
        '--primary-hover': mix(primary, '#FFFFFF', 74),
        '--primary-soft': alpha(primary, 0.18),
        '--primary-foreground': contrastText(primary),
        '--success-default': success,
        '--success-soft': alpha(success, 0.18),
        '--warning-default': warning,
        '--warning-soft': alpha(warning, 0.18),
        '--destructive-default': destructive,
        '--destructive-soft': alpha(destructive, 0.22),
        '--destructive-foreground': contrastText(destructive),
        '--icon-default': mix(neutral, '#FFFFFF', 64),
        '--icon-subtle': mix(neutral, '#FFFFFF', 42),
        '--element-bg-hover': alpha(neutral, 0.22),
        '--element-border-hover': alpha(neutral, 0.58),
        '--link-text-default': primary,
        '--link-text-hover': mix(primary, '#FFFFFF', 78),
      }
    : {
        '--text-default': mix(neutral, '#000000', 70),
        '--text-subtle': mix(neutral, '#000000', 54),
        '--background-default': mix(neutral, '#FFFFFF', 7),
        '--background-muted': mix(neutral, '#FFFFFF', 14),
        '--background-overlay': 'rgb(0 0 0 / 0.3)',
        '--background-selected': mix(primary, '#FFFFFF', 13),
        '--border-default': mix(neutral, '#FFFFFF', 44),
        '--border-bold': mix(neutral, '#000000', 72),
        '--primary-default': primary,
        '--primary-hover': mix(primary, '#000000', 76),
        '--primary-soft': mix(primary, '#FFFFFF', 14),
        '--primary-foreground': contrastText(primary),
        '--success-default': success,
        '--success-soft': mix(success, '#FFFFFF', 16),
        '--warning-default': warning,
        '--warning-soft': mix(warning, '#FFFFFF', 16),
        '--destructive-default': destructive,
        '--destructive-soft': mix(destructive, '#FFFFFF', 14),
        '--destructive-foreground': contrastText(destructive),
        '--icon-default': mix(neutral, '#000000', 58),
        '--icon-subtle': mix(neutral, '#000000', 38),
        '--element-bg-hover': mix(neutral, '#FFFFFF', 10),
        '--element-border-hover': mix(neutral, '#FFFFFF', 38),
        '--link-text-default': primary,
        '--link-text-hover': mix(primary, '#000000', 76),
      };
}

export function buildThemeStyleText(theme: ResolvedHackDeskTheme, mode: ResolvedThemeMode, presetId: ThemePresetId) {
  const lines = Object.entries(theme)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  return `:root {\n  color-scheme: ${mode};\n${lines}\n}\n:root { background-color: ${theme['--background-default']}; }\n:root[data-theme-preset="${presetId}"] { color-scheme: ${mode}; }\n`;
}

export function getThemeBackground(theme: ResolvedHackDeskTheme) {
  return theme['--background-default'] ?? '#FDFDFD';
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value.trim());
}

function normalizeHex(value: string) {
  return value.trim().toUpperCase();
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  const toHex = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function mix(from: string, to: string, fromWeightPercent: number) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const weight = Math.max(0, Math.min(100, fromWeightPercent)) / 100;
  return rgbToHex({
    r: a.r * weight + b.r * (1 - weight),
    g: a.g * weight + b.g * (1 - weight),
    b: a.b * weight + b.b * (1 - weight),
  });
}

function alpha(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${Math.max(0, Math.min(1, opacity)).toFixed(2)})`;
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const lift = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * lift(r) + 0.7152 * lift(g) + 0.0722 * lift(b);
}

function contrastText(hex: string) {
  return luminance(hex) > 0.48 ? '#000000' : '#FFFFFF';
}
