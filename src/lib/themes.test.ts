import { describe, expect, it } from 'vitest';

import {
  buildThemeStyleText,
  normalizeThemeSeed,
  parseStoredThemeSeed,
  resolveHackDeskTheme,
  serializeThemeSeed,
} from './themes';

describe('HackDesk themes', () => {
  it('resolves required semantic variables for light and dark modes', () => {
    const light = resolveHackDeskTheme({ presetId: 'hackmd', mode: 'light' });
    const dark = resolveHackDeskTheme({ presetId: 'hackmd', mode: 'dark' });

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
    const theme = resolveHackDeskTheme({ presetId: 'hackmd', mode: 'light', customSeed: seed });

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
    const theme = resolveHackDeskTheme({ presetId: 'forest', mode: 'dark' });
    const css = buildThemeStyleText(theme, 'dark', 'forest');

    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('--background-default:');
    expect(css).toContain(':root[data-theme-preset="forest"]');
  });
});
