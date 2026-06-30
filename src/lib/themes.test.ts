import { describe, expect, it } from 'vitest';

import {
  buildThemeStyleText,
  defaultThemeTypography,
  isSafeFontStack,
  normalizeThemeSeed,
  normalizeThemeTypography,
  parseStoredThemeSeed,
  resolveHackDeskTheme,
  serializeThemeSeed,
} from './themes';

describe('HackDesk themes', () => {
  it('resolves required semantic variables for light and dark modes', () => {
    const light = resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'light' });
    const dark = resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'dark' });

    expect(light['--background-default']).toMatch(/^#/);
    expect(light['--text-default']).toMatch(/^#/);
    expect(light['--primary-default']).toBe('#5D54E8');
    expect(dark['--background-default']).toMatch(/^#/);
    expect(dark['--text-default']).toMatch(/^#/);
    expect(dark['--primary-default']).toBe('#A8A2FF');
  });

  it('uses valid custom seed colors and ignores invalid values', () => {
    const seed = normalizeThemeSeed({
      primary: '#123abc',
      neutral: 'not-a-color',
      destructive: '#FF0000',
    });
    const theme = resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'light', customSeed: seed });

    expect(theme['--primary-default']).toBe('#123ABC');
    expect(theme['--destructive-default']).toBe('#FF0000');
    expect(theme['--background-default']).toMatch(/^#/);
  });

  it('round-trips persisted seeds safely', () => {
    const serialized = serializeThemeSeed({
      primary: '#5d54e8',
      warning: '#bad-value',
    });

    expect(parseStoredThemeSeed(serialized)).toEqual({ primary: '#5D54E8' });
    expect(parseStoredThemeSeed('not json')).toEqual({});
  });

  it('builds CSS for the resolved mode and preset', () => {
    const theme = resolveHackDeskTheme({ presetId: 'hackmd-nature', mode: 'dark' });
    const css = buildThemeStyleText(theme, 'dark', 'hackmd-nature');

    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('--background-default:');
    expect(css).toContain('--font-system:');
    expect(css).toContain('--code-keyword:');
    expect(css).toContain(':root[data-theme-preset="hackmd-nature"]');
  });

  it('resolves Catppuccin Latte and Mocha palette tokens', () => {
    const light = resolveHackDeskTheme({ presetId: 'catppuccin', mode: 'light' });
    const dark = resolveHackDeskTheme({ presetId: 'catppuccin', mode: 'dark' });

    expect(light['--background-default']).toBe('#EFF1F5');
    expect(light['--primary-default']).toBe('#8839EF');
    expect(light['--code-keyword']).toBe('#8839EF');
    expect(dark['--background-default']).toBe('#1E1E2E');
    expect(dark['--primary-default']).toBe('#CBA6F7');
    expect(dark['--code-string']).toBe('#A6E3A1');
  });

  it('keeps the Solarized preset id while resolving official light and dark surfaces', () => {
    const light = resolveHackDeskTheme({ presetId: 'solarized', mode: 'light' });
    const dark = resolveHackDeskTheme({ presetId: 'solarized', mode: 'dark' });

    expect(light['--background-default']).toBe('#FDF6E3');
    expect(light['--text-default']).toBe('#657B83');
    expect(dark['--background-default']).toBe('#002B36');
    expect(dark['--text-default']).toBe('#839496');
  });

  it('resolves Dracula dark and HackMD Neo light surfaces with Dracula accents', () => {
    const light = resolveHackDeskTheme({ presetId: 'dracula', mode: 'light' });
    const dark = resolveHackDeskTheme({ presetId: 'dracula', mode: 'dark' });

    expect(light['--background-default']).toMatch(/^#/);
    expect(light['--background-default']).not.toBe('#282A36');
    expect(light['--primary-default']).toBe('#BD93F9');
    expect(light['--code-keyword']).toBe('#BD93F9');
    expect(dark['--background-default']).toBe('#282A36');
    expect(dark['--text-default']).toBe('#F8F8F2');
    expect(dark['--code-string']).toBe('#50FA7B');
  });

  it('resolves Gruvbox Light and Dark palette tokens', () => {
    const light = resolveHackDeskTheme({ presetId: 'gruvbox', mode: 'light' });
    const dark = resolveHackDeskTheme({ presetId: 'gruvbox', mode: 'dark' });

    expect(light['--background-default']).toBe('#FBF1C7');
    expect(light['--text-default']).toBe('#3C3836');
    expect(light['--primary-default']).toBe('#458588');
    expect(light['--code-string']).toBe('#98971A');
    expect(dark['--background-default']).toBe('#282828');
    expect(dark['--text-default']).toBe('#EBDBB2');
    expect(dark['--primary-default']).toBe('#83A598');
    expect(dark['--code-number']).toBe('#FE8019');
  });

  it('keeps full palette base surfaces when custom seeds override accent tokens', () => {
    const theme = resolveHackDeskTheme({
      presetId: 'gruvbox',
      mode: 'dark',
      customSeed: { primary: '#123ABC' },
    });

    expect(theme['--background-default']).toBe('#282828');
    expect(theme['--text-default']).toBe('#EBDBB2');
    expect(theme['--primary-default']).toBe('#123ABC');
  });

  it('resolves safe font stacks directly', () => {
    const typography = normalizeThemeTypography({
      uiFontStack: 'system-ui, sans-serif',
      editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
    });
    const theme = resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'light', typography });

    expect(theme['--font-system']).toContain('system-ui');
    expect(theme['--font-sans']).toBe(theme['--font-system']);
    expect(theme['--font-editor']).toBe('"JetBrains Mono", ui-monospace, monospace');
    expect(theme['--font-mono']).toBe(theme['--font-editor']);
    expect(normalizeThemeTypography({}).uiFontStack).toEqual(defaultThemeTypography.uiFontStack);
    expect(isSafeFontStack('Inter; color: red')).toBe(false);
  });
});
