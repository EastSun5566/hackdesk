export type ThemeMode = 'dark' | 'light' | 'system';

export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export type ThemePresetId = 'hackmd-neo' | 'solarized' | 'catppuccin' | 'dracula' | 'gruvbox' | 'noctis';

export type ThemeTypography = {
  uiFontStack: string;
  editorFontStack: string;
  uiFontSize: number;
  editorFontSize: number;
};

export type ThemeSeed = {
  neutral: string;
  primary: string;
  success: string;
  warning: string;
  destructive: string;
};

export type ResolvedHackDeskTheme = Record<string, string>;

type ThemeTokenOverrides = Partial<ResolvedHackDeskTheme>;

export type ThemePreset = {
  id: ThemePresetId;
  name: string;
  description: string;
  light: ThemeSeed;
  dark: ThemeSeed;
  tokens?: Partial<Record<ResolvedThemeMode, ThemeTokenOverrides>>;
};

export const THEME_STYLE_ID = 'hackdesk-theme';
export const THEME_PRELOAD_STYLE_ID = 'hackdesk-theme-preload';

export const THEME_STORAGE_KEYS = {
  mode: 'theme-mode',
  legacyMode: 'theme',
  presetId: 'theme-preset-id',
  customSeed: 'theme-custom-seed',
  typography: 'theme-typography',
  cachedCss: 'hackdesk-theme-css',
} as const;

const HEX_COLOR_RE = /^#[\da-f]{6}$/i;
const FORBIDDEN_FONT_STACK_RE = /[;{}]|url\s*\(|var\s*\(|@import|expression\s*\(/i;
const UNQUOTED_FONT_FAMILY_RE = /^[-\w. ]+$/;
const QUOTED_FONT_FAMILY_RE = /^(?:"[^"\\\r\n]+"|'[^'\\\r\n]+')$/;

export const DEFAULT_UI_FONT_STACK = 'Inter, system-ui, sans-serif';
export const DEFAULT_EDITOR_FONT_STACK = '"Source Code Pro", ui-monospace, monospace';
export const DEFAULT_UI_FONT_SIZE = 14;
export const MIN_UI_FONT_SIZE = 12;
export const MAX_UI_FONT_SIZE = 18;
export const DEFAULT_EDITOR_FONT_SIZE = 14;
export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 32;

export const defaultThemeTypography: ThemeTypography = {
  uiFontStack: DEFAULT_UI_FONT_STACK,
  editorFontStack: DEFAULT_EDITOR_FONT_STACK,
  uiFontSize: DEFAULT_UI_FONT_SIZE,
  editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
};

const DEFAULT_SYNTAX_TOKENS: ThemeTokenOverrides = {
  '--code-keyword': '#C792EA',
  '--code-string': '#C3E88D',
  '--code-number': '#F78C6C',
  '--code-comment': '#6A7A82',
  '--code-type': '#FFCB6B',
  '--code-function': '#82AAFF',
  '--code-property': '#82AAFF',
  '--code-regexp': '#F07178',
  '--code-escape': '#89DDFF',
  '--code-operator': '#89DDFF',
  '--code-variable': '#EEFFFF',
  '--code-invalid': '#FF5370',
};

export const HACKDESK_THEME_PRESETS: ThemePreset[] = [
  {
    id: 'hackmd-neo',
    name: 'HackMD Neo',
    description: 'The default HackDesk writing palette.',
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
    id: 'solarized',
    name: 'Solarized',
    description: 'Ethan Schoonover’s low-contrast writing palette.',
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
    tokens: {
      light: {
        '--text-default': '#657B83',
        '--text-subtle': '#839496',
        '--background-default': '#FDF6E3',
        '--background-muted': '#EEE8D5',
        '--background-overlay': 'rgb(0 43 54 / 0.32)',
        '--background-selected': 'rgb(38 139 210 / 0.14)',
        '--border-default': '#EEE8D5',
        '--border-bold': '#93A1A1',
        '--primary-default': '#268BD2',
        '--primary-hover': '#006EB0',
        '--primary-soft': 'rgb(38 139 210 / 0.16)',
        '--primary-foreground': '#FDF6E3',
        '--success-default': '#859900',
        '--success-soft': 'rgb(133 153 0 / 0.16)',
        '--warning-default': '#B58900',
        '--warning-soft': 'rgb(181 137 0 / 0.16)',
        '--destructive-default': '#DC322F',
        '--destructive-soft': 'rgb(220 50 47 / 0.14)',
        '--destructive-foreground': '#FDF6E3',
        '--icon-default': '#657B83',
        '--icon-subtle': '#93A1A1',
        '--element-bg-hover': '#EEE8D5',
        '--element-border-hover': '#93A1A1',
        '--link-text-default': '#268BD2',
        '--link-text-hover': '#006EB0',
        '--code-keyword': '#6C71C4',
        '--code-string': '#2AA198',
        '--code-number': '#CB4B16',
        '--code-comment': '#93A1A1',
        '--code-type': '#B58900',
        '--code-function': '#268BD2',
        '--code-property': '#268BD2',
        '--code-regexp': '#D33682',
        '--code-escape': '#2AA198',
        '--code-operator': '#859900',
        '--code-variable': '#657B83',
        '--code-invalid': '#DC322F',
      },
      dark: {
        '--text-default': '#839496',
        '--text-subtle': '#657B83',
        '--background-default': '#002B36',
        '--background-muted': '#073642',
        '--background-overlay': 'rgb(0 0 0 / 0.72)',
        '--background-selected': 'rgb(42 161 152 / 0.22)',
        '--border-default': '#073642',
        '--border-bold': '#586E75',
        '--primary-default': '#2AA198',
        '--primary-hover': '#58C8BD',
        '--primary-soft': 'rgb(42 161 152 / 0.18)',
        '--primary-foreground': '#002B36',
        '--success-default': '#859900',
        '--success-soft': 'rgb(133 153 0 / 0.18)',
        '--warning-default': '#CB4B16',
        '--warning-soft': 'rgb(203 75 22 / 0.18)',
        '--destructive-default': '#DC322F',
        '--destructive-soft': 'rgb(220 50 47 / 0.2)',
        '--destructive-foreground': '#FDF6E3',
        '--icon-default': '#839496',
        '--icon-subtle': '#657B83',
        '--element-bg-hover': '#073642',
        '--element-border-hover': '#586E75',
        '--link-text-default': '#2AA198',
        '--link-text-hover': '#64D2C8',
        '--code-keyword': '#6C71C4',
        '--code-string': '#2AA198',
        '--code-number': '#CB4B16',
        '--code-comment': '#586E75',
        '--code-type': '#B58900',
        '--code-function': '#268BD2',
        '--code-property': '#268BD2',
        '--code-regexp': '#D33682',
        '--code-escape': '#2AA198',
        '--code-operator': '#859900',
        '--code-variable': '#839496',
        '--code-invalid': '#DC322F',
      },
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    description: 'Latte in light mode, Mocha in dark mode.',
    light: {
      neutral: '#6C6F85',
      primary: '#8839EF',
      success: '#40A02B',
      warning: '#DF8E1D',
      destructive: '#D20F39',
    },
    dark: {
      neutral: '#A6ADC8',
      primary: '#CBA6F7',
      success: '#A6E3A1',
      warning: '#F9E2AF',
      destructive: '#F38BA8',
    },
    tokens: {
      light: {
        '--text-default': '#4C4F69',
        '--text-subtle': '#6C6F85',
        '--background-default': '#EFF1F5',
        '--background-muted': '#E6E9EF',
        '--background-overlay': 'rgb(76 79 105 / 0.32)',
        '--background-selected': 'rgb(136 57 239 / 0.14)',
        '--border-default': '#BCC0CC',
        '--border-bold': '#7C7F93',
        '--primary-default': '#8839EF',
        '--primary-hover': '#6F2ACD',
        '--primary-soft': 'rgb(136 57 239 / 0.15)',
        '--primary-foreground': '#EFF1F5',
        '--success-default': '#40A02B',
        '--success-soft': 'rgb(64 160 43 / 0.16)',
        '--warning-default': '#DF8E1D',
        '--warning-soft': 'rgb(223 142 29 / 0.16)',
        '--destructive-default': '#D20F39',
        '--destructive-soft': 'rgb(210 15 57 / 0.14)',
        '--destructive-foreground': '#EFF1F5',
        '--icon-default': '#5C5F77',
        '--icon-subtle': '#8C8FA1',
        '--element-bg-hover': '#E6E9EF',
        '--element-border-hover': '#ACB0BE',
        '--link-text-default': '#1E66F5',
        '--link-text-hover': '#174FBF',
        '--code-keyword': '#8839EF',
        '--code-string': '#40A02B',
        '--code-number': '#FE640B',
        '--code-comment': '#8C8FA1',
        '--code-type': '#DF8E1D',
        '--code-function': '#1E66F5',
        '--code-property': '#209FB5',
        '--code-regexp': '#EA76CB',
        '--code-escape': '#179299',
        '--code-operator': '#04A5E5',
        '--code-variable': '#4C4F69',
        '--code-invalid': '#D20F39',
      },
      dark: {
        '--text-default': '#CDD6F4',
        '--text-subtle': '#A6ADC8',
        '--background-default': '#1E1E2E',
        '--background-muted': '#181825',
        '--background-overlay': 'rgb(17 17 27 / 0.72)',
        '--background-selected': 'rgb(203 166 247 / 0.2)',
        '--border-default': '#45475A',
        '--border-bold': '#9399B2',
        '--primary-default': '#CBA6F7',
        '--primary-hover': '#DDBDFF',
        '--primary-soft': 'rgb(203 166 247 / 0.17)',
        '--primary-foreground': '#1E1E2E',
        '--success-default': '#A6E3A1',
        '--success-soft': 'rgb(166 227 161 / 0.16)',
        '--warning-default': '#F9E2AF',
        '--warning-soft': 'rgb(249 226 175 / 0.16)',
        '--destructive-default': '#F38BA8',
        '--destructive-soft': 'rgb(243 139 168 / 0.2)',
        '--destructive-foreground': '#1E1E2E',
        '--icon-default': '#BAC2DE',
        '--icon-subtle': '#7F849C',
        '--element-bg-hover': '#313244',
        '--element-border-hover': '#585B70',
        '--link-text-default': '#89B4FA',
        '--link-text-hover': '#A6C7FF',
        '--code-keyword': '#CBA6F7',
        '--code-string': '#A6E3A1',
        '--code-number': '#FAB387',
        '--code-comment': '#7F849C',
        '--code-type': '#F9E2AF',
        '--code-function': '#89B4FA',
        '--code-property': '#74C7EC',
        '--code-regexp': '#F5C2E7',
        '--code-escape': '#94E2D5',
        '--code-operator': '#89DCEB',
        '--code-variable': '#CDD6F4',
        '--code-invalid': '#F38BA8',
      },
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Alucard Classic in light mode, Dracula Classic in dark mode.',
    light: {
      neutral: '#6C664B',
      primary: '#815CD6',
      success: '#089108',
      warning: '#A39514',
      destructive: '#DE5735',
    },
    dark: {
      neutral: '#6272A4',
      primary: '#BD93F9',
      success: '#50FA7B',
      warning: '#FFB86C',
      destructive: '#FF5555',
    },
    tokens: {
      light: {
        '--text-default': '#1F1F1F',
        '--text-subtle': '#6C664B',
        '--background-default': '#FFFBEB',
        '--background-muted': '#EFEDDC',
        '--background-overlay': 'rgb(31 31 31 / 0.32)',
        '--background-selected': 'rgb(207 207 222 / 0.72)',
        '--border-default': '#DEDCCF',
        '--border-bold': '#6C664B',
        '--primary-default': '#815CD6',
        '--primary-hover': '#644AC9',
        '--primary-soft': 'rgb(129 92 214 / 0.16)',
        '--primary-foreground': '#FFFBEB',
        '--success-default': '#089108',
        '--success-soft': 'rgb(8 145 8 / 0.14)',
        '--warning-default': '#A39514',
        '--warning-soft': 'rgb(163 149 20 / 0.16)',
        '--destructive-default': '#DE5735',
        '--destructive-soft': 'rgb(222 87 53 / 0.14)',
        '--destructive-foreground': '#FFFBEB',
        '--icon-default': '#1F1F1F',
        '--icon-subtle': '#6C664B',
        '--element-bg-hover': '#ECE9DF',
        '--element-border-hover': '#BCBAB3',
        '--link-text-default': '#0081D6',
        '--link-text-hover': '#036A96',
        '--code-keyword': '#A3144D',
        '--code-string': '#846E15',
        '--code-number': '#A34D14',
        '--code-comment': '#6C664B',
        '--code-type': '#036A96',
        '--code-function': '#14710A',
        '--code-property': '#036A96',
        '--code-regexp': '#036A96',
        '--code-escape': '#036A96',
        '--code-operator': '#A3144D',
        '--code-variable': '#1F1F1F',
        '--code-invalid': '#CB3A2A',
      },
      dark: {
        '--text-default': '#F8F8F2',
        '--text-subtle': '#BCC2CD',
        '--background-default': '#282A36',
        '--background-muted': '#21222C',
        '--background-overlay': 'rgb(0 0 0 / 0.72)',
        '--background-selected': 'rgb(189 147 249 / 0.22)',
        '--border-default': '#44475A',
        '--border-bold': '#6272A4',
        '--primary-default': '#BD93F9',
        '--primary-hover': '#D6BCFF',
        '--primary-soft': 'rgb(189 147 249 / 0.18)',
        '--primary-foreground': '#282A36',
        '--success-default': '#50FA7B',
        '--success-soft': 'rgb(80 250 123 / 0.16)',
        '--warning-default': '#FFB86C',
        '--warning-soft': 'rgb(255 184 108 / 0.16)',
        '--destructive-default': '#FF5555',
        '--destructive-soft': 'rgb(255 85 85 / 0.2)',
        '--destructive-foreground': '#282A36',
        '--icon-default': '#F8F8F2',
        '--icon-subtle': '#6272A4',
        '--element-bg-hover': '#44475A',
        '--element-border-hover': '#6272A4',
        '--link-text-default': '#8BE9FD',
        '--link-text-hover': '#B7F4FF',
        '--code-keyword': '#BD93F9',
        '--code-string': '#50FA7B',
        '--code-number': '#FFB86C',
        '--code-comment': '#6272A4',
        '--code-type': '#F1FA8C',
        '--code-function': '#8BE9FD',
        '--code-property': '#8BE9FD',
        '--code-regexp': '#FF79C6',
        '--code-escape': '#8BE9FD',
        '--code-operator': '#FF79C6',
        '--code-variable': '#F8F8F2',
        '--code-invalid': '#FF5555',
      },
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    description: 'Gruvbox Light and Dark for warm terminal-style writing.',
    light: {
      neutral: '#7C6F64',
      primary: '#458588',
      success: '#98971A',
      warning: '#D79921',
      destructive: '#CC241D',
    },
    dark: {
      neutral: '#928374',
      primary: '#83A598',
      success: '#B8BB26',
      warning: '#FABD2F',
      destructive: '#FB4934',
    },
    tokens: {
      light: {
        '--text-default': '#3C3836',
        '--text-subtle': '#665C54',
        '--background-default': '#FBF1C7',
        '--background-muted': '#EBDBB2',
        '--background-overlay': 'rgb(60 56 54 / 0.32)',
        '--background-selected': 'rgb(69 133 136 / 0.16)',
        '--border-default': '#D5C4A1',
        '--border-bold': '#7C6F64',
        '--primary-default': '#458588',
        '--primary-hover': '#076678',
        '--primary-soft': 'rgb(69 133 136 / 0.16)',
        '--primary-foreground': '#FBF1C7',
        '--success-default': '#98971A',
        '--success-soft': 'rgb(152 151 26 / 0.16)',
        '--warning-default': '#D79921',
        '--warning-soft': 'rgb(215 153 33 / 0.18)',
        '--destructive-default': '#CC241D',
        '--destructive-soft': 'rgb(204 36 29 / 0.14)',
        '--destructive-foreground': '#FBF1C7',
        '--icon-default': '#504945',
        '--icon-subtle': '#7C6F64',
        '--element-bg-hover': '#EBDBB2',
        '--element-border-hover': '#BDAE93',
        '--link-text-default': '#458588',
        '--link-text-hover': '#076678',
        '--code-keyword': '#B16286',
        '--code-string': '#98971A',
        '--code-number': '#D65D0E',
        '--code-comment': '#928374',
        '--code-type': '#D79921',
        '--code-function': '#458588',
        '--code-property': '#689D6A',
        '--code-regexp': '#B16286',
        '--code-escape': '#689D6A',
        '--code-operator': '#D65D0E',
        '--code-variable': '#3C3836',
        '--code-invalid': '#CC241D',
      },
      dark: {
        '--text-default': '#EBDBB2',
        '--text-subtle': '#BDAE93',
        '--background-default': '#282828',
        '--background-muted': '#1D2021',
        '--background-overlay': 'rgb(0 0 0 / 0.72)',
        '--background-selected': 'rgb(131 165 152 / 0.2)',
        '--border-default': '#504945',
        '--border-bold': '#928374',
        '--primary-default': '#83A598',
        '--primary-hover': '#A7C7BB',
        '--primary-soft': 'rgb(131 165 152 / 0.18)',
        '--primary-foreground': '#282828',
        '--success-default': '#B8BB26',
        '--success-soft': 'rgb(184 187 38 / 0.16)',
        '--warning-default': '#FABD2F',
        '--warning-soft': 'rgb(250 189 47 / 0.16)',
        '--destructive-default': '#FB4934',
        '--destructive-soft': 'rgb(251 73 52 / 0.2)',
        '--destructive-foreground': '#282828',
        '--icon-default': '#EBDBB2',
        '--icon-subtle': '#928374',
        '--element-bg-hover': '#3C3836',
        '--element-border-hover': '#665C54',
        '--link-text-default': '#83A598',
        '--link-text-hover': '#A7C7BB',
        '--code-keyword': '#D3869B',
        '--code-string': '#B8BB26',
        '--code-number': '#FE8019',
        '--code-comment': '#928374',
        '--code-type': '#FABD2F',
        '--code-function': '#83A598',
        '--code-property': '#8EC07C',
        '--code-regexp': '#D3869B',
        '--code-escape': '#8EC07C',
        '--code-operator': '#FE8019',
        '--code-variable': '#EBDBB2',
        '--code-invalid': '#FB4934',
      },
    },
  },
  {
    id: 'noctis',
    name: 'Noctis',
    description: 'Noctis Lux in light mode, Noctis in dark mode.',
    light: {
      neutral: '#8CA6A6',
      primary: '#0099AD',
      success: '#00B368',
      warning: '#E69533',
      destructive: '#FF4000',
    },
    dark: {
      neutral: '#5B858B',
      primary: '#40D4E7',
      success: '#49E9A6',
      warning: '#E69533',
      destructive: '#E34E1C',
    },
    tokens: {
      light: {
        '--text-default': '#005661',
        '--text-subtle': '#888477',
        '--background-default': '#FEF8EC',
        '--background-muted': '#F9F1E1',
        '--background-overlay': 'rgb(0 86 97 / 0.30)',
        '--background-selected': 'rgb(173 226 235 / 0.72)',
        '--border-default': '#F2EDDE',
        '--border-bold': '#6A7A7C',
        '--primary-default': '#0099AD',
        '--primary-hover': '#007C8C',
        '--primary-soft': 'rgb(0 153 173 / 0.15)',
        '--primary-foreground': '#FEF8EC',
        '--success-default': '#00B368',
        '--success-soft': 'rgb(0 179 104 / 0.14)',
        '--warning-default': '#E69533',
        '--warning-soft': 'rgb(230 149 51 / 0.18)',
        '--destructive-default': '#FF4000',
        '--destructive-soft': 'rgb(255 64 0 / 0.14)',
        '--destructive-foreground': '#FEF8EC',
        '--icon-default': '#005661',
        '--icon-subtle': '#8CA6A6',
        '--element-bg-hover': '#D2F3F9',
        '--element-border-hover': '#B6E1E7',
        '--link-text-default': '#0099AD',
        '--link-text-hover': '#007C8C',
        '--code-keyword': '#FF5792',
        '--code-string': '#00B368',
        '--code-number': '#5842FF',
        '--code-comment': '#8CA6A6',
        '--code-type': '#00BDD6',
        '--code-function': '#0095A8',
        '--code-property': '#0094F0',
        '--code-regexp': '#00BDD6',
        '--code-escape': '#00BDD6',
        '--code-operator': '#0094F0',
        '--code-variable': '#004D57',
        '--code-invalid': '#FF530F',
      },
      dark: {
        '--text-default': '#B2CACD',
        '--text-subtle': '#87A7AB',
        '--background-default': '#052529',
        '--background-muted': '#041D20',
        '--background-overlay': 'rgb(0 0 0 / 0.72)',
        '--background-selected': 'rgb(22 159 177 / 0.28)',
        '--border-default': '#0F1415',
        '--border-bold': '#169FB1',
        '--primary-default': '#40D4E7',
        '--primary-hover': '#85EFFF',
        '--primary-soft': 'rgb(64 212 231 / 0.16)',
        '--primary-foreground': '#0F1415',
        '--success-default': '#49E9A6',
        '--success-soft': 'rgb(73 233 166 / 0.16)',
        '--warning-default': '#E69533',
        '--warning-soft': 'rgb(230 149 51 / 0.18)',
        '--destructive-default': '#E34E1C',
        '--destructive-soft': 'rgb(227 78 28 / 0.20)',
        '--destructive-foreground': '#EBFDFF',
        '--icon-default': '#B2CACD',
        '--icon-subtle': '#5B858B',
        '--element-bg-hover': '#0B515B',
        '--element-border-hover': '#0E6671',
        '--link-text-default': '#40D4E7',
        '--link-text-hover': '#85EFFF',
        '--code-keyword': '#DF769B',
        '--code-string': '#49E9A6',
        '--code-number': '#7060EB',
        '--code-comment': '#5B858B',
        '--code-type': '#49D6E9',
        '--code-function': '#16A3B6',
        '--code-property': '#49ACE9',
        '--code-regexp': '#49D6E9',
        '--code-escape': '#49D6E9',
        '--code-operator': '#49ACE9',
        '--code-variable': '#B2CACD',
        '--code-invalid': '#E3541C',
      },
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

export function normalizeThemePresetId(value: unknown, fallback: ThemePresetId = 'hackmd-neo'): ThemePresetId {
  return isThemePresetId(value) ? value : fallback;
}

export function getThemePreset(id: ThemePresetId): ThemePreset {
  return THEME_PRESET_BY_ID.get(id) ?? HACKDESK_THEME_PRESETS[0];
}

export function isSafeFontStack(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 180 || FORBIDDEN_FONT_STACK_RE.test(trimmed)) {
    return false;
  }

  return trimmed.split(',').every((part) => {
    const family = part.trim();
    return family.length > 0
      && family.length <= 64
      && (QUOTED_FONT_FAMILY_RE.test(family) || UNQUOTED_FONT_FAMILY_RE.test(family));
  });
}

export function normalizeFontStack(value: unknown, fallback = '') {
  if (!isSafeFontStack(value)) {
    return fallback;
  }

  return value
    .trim()
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

export function normalizeThemeTypography(value: unknown): ThemeTypography {
  if (!value || typeof value !== 'object') {
    return defaultThemeTypography;
  }

  const candidate = value as Partial<Record<keyof ThemeTypography, unknown>>;
  return {
    uiFontStack: normalizeFontStack(candidate.uiFontStack, defaultThemeTypography.uiFontStack),
    editorFontStack: normalizeFontStack(candidate.editorFontStack, defaultThemeTypography.editorFontStack),
    uiFontSize: normalizeFontSize(
      candidate.uiFontSize,
      defaultThemeTypography.uiFontSize,
      MIN_UI_FONT_SIZE,
      MAX_UI_FONT_SIZE,
    ),
    editorFontSize: normalizeFontSize(
      candidate.editorFontSize,
      defaultThemeTypography.editorFontSize,
      MIN_EDITOR_FONT_SIZE,
      MAX_EDITOR_FONT_SIZE,
    ),
  };
}

export function parseStoredThemeTypography(value: string | null): ThemeTypography {
  if (!value) {
    return defaultThemeTypography;
  }

  try {
    return normalizeThemeTypography(JSON.parse(value));
  } catch {
    return defaultThemeTypography;
  }
}

export function serializeThemeTypography(typography: ThemeTypography) {
  return JSON.stringify(normalizeThemeTypography(typography));
}

export function resolveThemeTypography(typography: ThemeTypography): ResolvedHackDeskTheme {
  const normalized = normalizeThemeTypography(typography);

  return {
    '--font-system': normalized.uiFontStack,
    '--font-sans': normalized.uiFontStack,
    '--font-editor': normalized.editorFontStack,
    '--font-mono': normalized.editorFontStack,
    '--font-size-ui': pxToRem(normalized.uiFontSize),
    '--font-size-editor': pxToRem(normalized.editorFontSize),
    '--text-xs': 'calc(var(--font-size-ui) * 0.8571428571)',
    '--text-sm': 'var(--font-size-ui)',
    '--text-base': 'calc(var(--font-size-ui) * 1.1428571429)',
    '--text-lg': 'calc(var(--font-size-ui) * 1.2857142857)',
    '--text-2xl': 'calc(var(--font-size-ui) * 1.7142857143)',
  };
}

function normalizeFontSize(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function pxToRem(value: number) {
  return `${Number((value / 16).toFixed(6))}rem`;
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
  typography = defaultThemeTypography,
}: {
  presetId: ThemePresetId;
  mode: ResolvedThemeMode;
  customSeed?: Partial<ThemeSeed>;
  typography?: ThemeTypography;
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

  const seedTheme = dark
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
  const presetTokenOverrides = preset.tokens?.[mode] ?? {};
  const customAccentOverrides = Object.keys(normalizeThemeSeed(customSeed)).length > 0
    ? buildAccentTokenOverrides(seed, dark)
    : {};
  const colorTheme: ResolvedHackDeskTheme = {
    ...DEFAULT_SYNTAX_TOKENS,
    ...seedTheme,
    ...presetTokenOverrides,
    ...customAccentOverrides,
  };
  const contrastTheme = resolveContrastTokens(colorTheme);

  return {
    ...contrastTheme,
    ...resolveNativeSurfaceTokens(contrastTheme),
    ...resolveThemeTypography(typography),
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

function buildAccentTokenOverrides(seed: ThemeSeed, dark: boolean): ThemeTokenOverrides {
  const { primary, success, warning, destructive } = seed;
  return dark
    ? {
        '--background-selected': alpha(primary, 0.28),
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
        '--link-text-default': primary,
        '--link-text-hover': mix(primary, '#FFFFFF', 78),
      }
    : {
        '--background-selected': mix(primary, '#FFFFFF', 13),
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
        '--link-text-default': primary,
        '--link-text-hover': mix(primary, '#000000', 76),
      };
}

function resolveContrastTokens(theme: ResolvedHackDeskTheme): ResolvedHackDeskTheme {
  const background = theme['--background-default'];
  if (!isHexColor(background)) {
    return {
      ...theme,
      '--focus-ring': theme['--primary-default'] ?? '#5D54E8',
    };
  }

  const textDefault = ensureContrast(theme['--text-default'], background, 4.5);
  const textSubtle = ensureContrast(theme['--text-subtle'], background, 4.5);
  const primary = ensureContrast(theme['--primary-default'], background, 3);
  const borderBold = ensureContrast(theme['--border-bold'], background, 3);
  const primaryHover = ensureContrast(theme['--primary-hover'], background, 3);

  return {
    ...theme,
    '--text-default': textDefault,
    '--text-subtle': textSubtle,
    '--primary-default': primary,
    '--primary-hover': primaryHover,
    '--primary-foreground': contrastText(primary),
    '--border-bold': borderBold,
    '--focus-ring': primary,
  };
}

function resolveNativeSurfaceTokens(theme: ResolvedHackDeskTheme): ResolvedHackDeskTheme {
  const backgroundMuted = theme['--background-muted'];
  const scrollbarThumb = ensureContrast(theme['--border-bold'], backgroundMuted, 3);
  const focusRing = theme['--focus-ring'] ?? theme['--primary-default'];

  return {
    '--scrollbar-thumb': scrollbarThumb,
    '--scrollbar-track': backgroundMuted,
    '--selection-background': focusRing,
    '--selection-foreground': isHexColor(focusRing) ? contrastText(focusRing) : 'var(--primary-foreground)',
  };
}

function ensureContrast(value: string | undefined, background: string | undefined, minRatio: number) {
  if (!isHexColor(value) || !isHexColor(background) || contrastRatio(value, background) >= minRatio) {
    return value ?? '';
  }

  const target = luminance(background) > luminance(value) ? '#000000' : '#FFFFFF';
  for (let weight = 95; weight >= 0; weight -= 5) {
    const candidate = mix(value, target, weight);
    if (contrastRatio(candidate, background) >= minRatio) {
      return candidate;
    }
  }

  return target;
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

function contrastRatio(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function contrastText(hex: string) {
  return luminance(hex) > 0.48 ? '#000000' : '#FFFFFF';
}
