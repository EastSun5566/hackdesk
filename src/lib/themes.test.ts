import { describe, expect, it } from 'vitest';

import {
  buildThemeStyleText,
  defaultThemeTypography,
  HACKDESK_THEME_PRESETS,
  isSafeFontStack,
  normalizeThemeSeed,
  normalizeThemeTypography,
  parseStoredThemeSeed,
  resolveHackDeskTheme,
  serializeThemeSeed,
} from './themes';

function hexToRgb(hex: string) {
  const normalized = hex.slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
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

function expectContrast(
  foreground: string,
  background: string,
  minimum: number,
  label: string,
) {
  expect(foreground, `${label} should be a hex color`).toMatch(/^#[\da-f]{6}$/i);
  expect(background, `${label} background should be a hex color`).toMatch(/^#[\da-f]{6}$/i);
  expect(contrastRatio(foreground, background), label).toBeGreaterThanOrEqual(minimum);
}

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
    const theme = resolveHackDeskTheme({ presetId: 'noctis', mode: 'dark' });
    const css = buildThemeStyleText(theme, 'dark', 'noctis');

    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('--background-default:');
    expect(css).toContain('--font-system:');
    expect(css).toContain('--code-keyword:');
    expect(css).toContain('--focus-ring:');
    expect(css).toContain('--scrollbar-thumb:');
    expect(css).toContain('--scrollbar-track:');
    expect(css).toContain('--selection-background:');
    expect(css).toContain('--selection-foreground:');
    expect(css).toContain(':root[data-theme-preset="noctis"]');
  });

  it('resolves contrast-safe native surface tokens for every preset and mode', () => {
    for (const preset of HACKDESK_THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const theme = resolveHackDeskTheme({ presetId: preset.id, mode });

        expectContrast(theme['--text-default'], theme['--background-default'], 4.5, `${preset.id} ${mode} text`);
        expectContrast(theme['--text-subtle'], theme['--background-default'], 4.5, `${preset.id} ${mode} subtle text`);
        expectContrast(theme['--primary-default'], theme['--background-default'], 3, `${preset.id} ${mode} primary`);
        expectContrast(theme['--focus-ring'], theme['--background-default'], 3, `${preset.id} ${mode} focus`);
        expectContrast(theme['--border-bold'], theme['--background-default'], 3, `${preset.id} ${mode} border`);
        expectContrast(theme['--selection-background'], theme['--background-default'], 3, `${preset.id} ${mode} selection`);
        expectContrast(theme['--scrollbar-thumb'], theme['--scrollbar-track'], 3, `${preset.id} ${mode} scrollbar`);
      }
    }
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
    expectContrast(light['--text-default'], light['--background-default'], 4.5, 'solarized light text');
    expect(dark['--background-default']).toBe('#002B36');
    expectContrast(dark['--text-default'], dark['--background-default'], 4.5, 'solarized dark text');
  });

  it('resolves Dracula Alucard and Classic palette tokens', () => {
    const light = resolveHackDeskTheme({ presetId: 'dracula', mode: 'light' });
    const dark = resolveHackDeskTheme({ presetId: 'dracula', mode: 'dark' });

    expect(light['--background-default']).toBe('#FFFBEB');
    expect(light['--text-default']).toBe('#1F1F1F');
    expectContrast(light['--primary-default'], light['--background-default'], 3, 'dracula light primary');
    expect(light['--code-keyword']).toBe('#A3144D');
    expect(dark['--background-default']).toBe('#282A36');
    expect(dark['--text-default']).toBe('#F8F8F2');
    expect(dark['--code-string']).toBe('#50FA7B');
  });

  it('resolves Noctis Lux and Noctis palette tokens', () => {
    const light = resolveHackDeskTheme({ presetId: 'noctis', mode: 'light' });
    const dark = resolveHackDeskTheme({ presetId: 'noctis', mode: 'dark' });

    expect(light['--background-default']).toBe('#FEF8EC');
    expect(light['--text-default']).toBe('#005661');
    expect(light['--primary-default']).toBe('#0099AD');
    expect(light['--code-keyword']).toBe('#FF5792');
    expect(light['--code-string']).toBe('#00B368');
    expect(dark['--background-default']).toBe('#052529');
    expect(dark['--text-default']).toBe('#B2CACD');
    expect(dark['--primary-default']).toBe('#40D4E7');
    expect(dark['--code-keyword']).toBe('#DF769B');
    expect(dark['--code-string']).toBe('#49E9A6');
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
      customSeed: { primary: '#A8A2FF' },
    });

    expect(theme['--background-default']).toBe('#282828');
    expect(theme['--text-default']).toBe('#EBDBB2');
    expect(theme['--primary-default']).toBe('#A8A2FF');
    expectContrast(theme['--focus-ring'], theme['--background-default'], 3, 'custom seed focus ring');
    expectContrast(theme['--selection-background'], theme['--background-default'], 3, 'custom seed selection');
  });

  it('contrast-adjusts low-contrast custom primary seeds for focus and selection', () => {
    const theme = resolveHackDeskTheme({
      presetId: 'gruvbox',
      mode: 'dark',
      customSeed: { primary: '#123ABC' },
    });

    expect(theme['--primary-default']).not.toBe('#123ABC');
    expectContrast(theme['--primary-default'], theme['--background-default'], 3, 'adjusted custom primary');
    expectContrast(theme['--focus-ring'], theme['--background-default'], 3, 'adjusted custom focus');
    expectContrast(theme['--selection-background'], theme['--background-default'], 3, 'adjusted custom selection');
  });

  it('resolves safe font stacks directly', () => {
    const typography = normalizeThemeTypography({
      uiFontStack: 'system-ui, sans-serif',
      editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
      uiFontSize: 16,
      editorFontSize: 20,
    });
    const theme = resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'light', typography });

    expect(theme['--font-system']).toContain('system-ui');
    expect(theme['--font-sans']).toBe(theme['--font-system']);
    expect(theme['--font-editor']).toBe('"JetBrains Mono", ui-monospace, monospace');
    expect(theme['--font-mono']).toBe(theme['--font-editor']);
    expect(theme['--font-size-ui']).toBe('1rem');
    expect(theme['--font-size-editor']).toBe('1.25rem');
    expect(theme['--text-sm']).toBe('var(--font-size-ui)');
    expect(theme['--text-xs']).toContain('var(--font-size-ui)');
    expect(theme['--text-base']).toContain('var(--font-size-ui)');
    expect(normalizeThemeTypography({}).uiFontStack).toEqual(defaultThemeTypography.uiFontStack);
    expect(normalizeThemeTypography({ uiFontSize: 11, editorFontSize: 33 })).toMatchObject({
      uiFontSize: defaultThemeTypography.uiFontSize,
      editorFontSize: defaultThemeTypography.editorFontSize,
    });
    expect(isSafeFontStack('Inter; color: red')).toBe(false);
  });
});
