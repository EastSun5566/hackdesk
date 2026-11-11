import { useSyncExternalStore } from 'react';

import { trySetStorageItem } from '@/lib/storage';
import {
  HACKDESK_THEME_PRESETS,
  resolveHackDeskTheme,
  type ResolvedThemeMode,
  type ThemePresetId,
} from '@/lib/themes';

/**
 * Syntax colours for code blocks, chosen apart from the app theme. 'theme' follows the theme
 * preset; the others swap only the --code-* tokens, so the code panel keeps the theme's surface.
 */
export type CodeThemeId = 'theme' | ThemePresetId | 'github' | 'one';

type CodePalette = Record<`--code-${string}`, string>;

const CODE_TOKEN_NAMES = [
  '--code-keyword',
  '--code-string',
  '--code-number',
  '--code-comment',
  '--code-type',
  '--code-function',
  '--code-property',
  '--code-regexp',
  '--code-escape',
  '--code-operator',
  '--code-variable',
  '--code-invalid',
] as const;

// GitHub's Primer syntax colours (light and dark default).
const GITHUB: Record<ResolvedThemeMode, CodePalette> = {
  light: {
    '--code-keyword': '#CF222E',
    '--code-string': '#0A3069',
    '--code-number': '#0550AE',
    '--code-comment': '#6E7781',
    '--code-type': '#953800',
    '--code-function': '#8250DF',
    '--code-property': '#0550AE',
    '--code-regexp': '#116329',
    '--code-escape': '#116329',
    '--code-operator': '#CF222E',
    '--code-variable': '#24292F',
    '--code-invalid': '#82071E',
  },
  dark: {
    '--code-keyword': '#FF7B72',
    '--code-string': '#A5D6FF',
    '--code-number': '#79C0FF',
    '--code-comment': '#8B949E',
    '--code-type': '#FFA657',
    '--code-function': '#D2A8FF',
    '--code-property': '#79C0FF',
    '--code-regexp': '#7EE787',
    '--code-escape': '#7EE787',
    '--code-operator': '#FF7B72',
    '--code-variable': '#C9D1D9',
    '--code-invalid': '#FFA198',
  },
};

// Atom's One Light and One Dark.
const ONE: Record<ResolvedThemeMode, CodePalette> = {
  light: {
    '--code-keyword': '#A626A4',
    '--code-string': '#50A14F',
    '--code-number': '#986801',
    '--code-comment': '#A0A1A7',
    '--code-type': '#C18401',
    '--code-function': '#4078F2',
    '--code-property': '#E45649',
    '--code-regexp': '#0184BC',
    '--code-escape': '#0184BC',
    '--code-operator': '#0184BC',
    '--code-variable': '#383A42',
    '--code-invalid': '#CA1243',
  },
  dark: {
    '--code-keyword': '#C678DD',
    '--code-string': '#98C379',
    '--code-number': '#D19A66',
    '--code-comment': '#7F848E',
    '--code-type': '#E5C07B',
    '--code-function': '#61AFEF',
    '--code-property': '#E06C75',
    '--code-regexp': '#56B6C2',
    '--code-escape': '#56B6C2',
    '--code-operator': '#56B6C2',
    '--code-variable': '#ABB2BF',
    '--code-invalid': '#F44747',
  },
};

export const CODE_THEMES: { id: CodeThemeId; name: string }[] = [
  { id: 'theme', name: 'Match app theme' },
  { id: 'github', name: 'GitHub' },
  { id: 'one', name: 'One' },
  ...HACKDESK_THEME_PRESETS.map((preset) => ({ id: preset.id, name: preset.name })),
];

export const DEFAULT_CODE_THEME: CodeThemeId = 'theme';
export const CODE_THEME_STORAGE_KEY = 'hackdesk_code_theme';
export const CODE_THEME_STYLE_ID = 'hackdesk-code-theme';

export function isCodeThemeId(value: unknown): value is CodeThemeId {
  return CODE_THEMES.some((theme) => theme.id === value);
}

export function getCodePalette(id: Exclude<CodeThemeId, 'theme'>, mode: ResolvedThemeMode): CodePalette {
  if (id === 'github') return GITHUB[mode];
  if (id === 'one') return ONE[mode];
  const theme = resolveHackDeskTheme({ presetId: id, mode });
  return Object.fromEntries(CODE_TOKEN_NAMES.map((name) => [name, theme[name]])) as CodePalette;
}

/**
 * One stylesheet with every palette, keyed on the root's mode class and data-code-theme. Its
 * selectors outrank the theme's `:root` rule, so picking a palette is a single attribute change.
 */
export function buildCodeThemeStyleText(): string {
  return CODE_THEMES.flatMap(({ id }) => {
    if (id === 'theme') return [];
    return (['light', 'dark'] as const).map((mode) => {
      const declarations = Object.entries(getCodePalette(id, mode))
        .map(([name, value]) => `  ${name}: ${value};`)
        .join('\n');
      return `:root.${mode}[data-code-theme="${id}"] {\n${declarations}\n}`;
    });
  }).join('\n');
}

const listeners = new Set<() => void>();

export function readCodeTheme(): CodeThemeId {
  if (typeof window === 'undefined') return DEFAULT_CODE_THEME;
  try {
    const stored = window.localStorage.getItem(CODE_THEME_STORAGE_KEY);
    return isCodeThemeId(stored) ? stored : DEFAULT_CODE_THEME;
  } catch {
    return DEFAULT_CODE_THEME;
  }
}

/** Puts the palettes' stylesheet in the document (once) and records the choice on the root. */
export function applyCodeTheme(id: CodeThemeId = readCodeTheme(), doc: Document = document) {
  if (!doc.getElementById(CODE_THEME_STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = CODE_THEME_STYLE_ID;
    style.textContent = buildCodeThemeStyleText();
    doc.head.appendChild(style);
  }
  if (id === 'theme') delete doc.documentElement.dataset.codeTheme;
  else doc.documentElement.dataset.codeTheme = id;
}

export function setCodeTheme(id: CodeThemeId) {
  trySetStorageItem(window.localStorage, CODE_THEME_STORAGE_KEY, id);
  applyCodeTheme(id);
  listeners.forEach((listener) => listener());
}

/** Applies the stored choice now and follows changes made in other windows. */
export function installCodeTheme() {
  applyCodeTheme();
  window.addEventListener('storage', (event) => {
    if (event.key !== CODE_THEME_STORAGE_KEY) return;
    applyCodeTheme();
    listeners.forEach((listener) => listener());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCodeTheme() {
  return useSyncExternalStore(subscribe, readCodeTheme, () => DEFAULT_CODE_THEME);
}
