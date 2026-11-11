import { afterEach, describe, expect, it } from 'vitest';

import {
  applyCodeTheme,
  buildCodeThemeStyleText,
  CODE_THEME_STORAGE_KEY,
  CODE_THEME_STYLE_ID,
  CODE_THEMES,
  getCodePalette,
  readCodeTheme,
  setCodeTheme,
} from './code-themes';

describe('code themes', () => {
  afterEach(() => {
    window.localStorage.clear();
    document.getElementById(CODE_THEME_STYLE_ID)?.remove();
    delete document.documentElement.dataset.codeTheme;
  });

  it('gives every palette the full set of code tokens in both modes', () => {
    for (const { id } of CODE_THEMES) {
      if (id === 'theme') continue;
      for (const mode of ['light', 'dark'] as const) {
        const palette = getCodePalette(id, mode);
        expect(Object.keys(palette)).toHaveLength(12);
        for (const value of Object.values(palette)) expect(value).toMatch(/^#[\da-f]{6}$/i);
      }
    }
  });

  it('keys each palette on the mode class and the root attribute, never the matching theme', () => {
    const css = buildCodeThemeStyleText();
    expect(css).toContain(':root.dark[data-code-theme="github"]');
    expect(css).toContain(':root.light[data-code-theme="dracula"]');
    expect(css).not.toContain('data-code-theme="theme"');
  });

  it('stores the choice, records it on the root, and falls back for unknown values', () => {
    setCodeTheme('github');
    expect(window.localStorage.getItem(CODE_THEME_STORAGE_KEY)).toBe('github');
    expect(document.documentElement.dataset.codeTheme).toBe('github');
    expect(document.getElementById(CODE_THEME_STYLE_ID)).not.toBeNull();

    setCodeTheme('theme');
    expect(document.documentElement.dataset.codeTheme).toBeUndefined();

    window.localStorage.setItem(CODE_THEME_STORAGE_KEY, 'not-a-theme');
    expect(readCodeTheme()).toBe('theme');
    applyCodeTheme();
    expect(document.querySelectorAll(`#${CODE_THEME_STYLE_ID}`)).toHaveLength(1);
  });
});
