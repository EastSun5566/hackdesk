import { describe, expect, it } from 'vitest';

import { detectShowcasePlatform, getShowcaseImage } from './editor-showcase';

describe('detectShowcasePlatform', () => {
  it('defaults to macOS for macOS, mobile, and server rendering', () => {
    expect(detectShowcasePlatform(undefined)).toBe('macos');
    expect(detectShowcasePlatform({ platform: 'MacIntel' })).toBe('macos');
    expect(detectShowcasePlatform({ userAgentData: { platform: 'macOS' } })).toBe('macos');
    expect(detectShowcasePlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' })).toBe('macos');
  });

  it('selects Windows / Linux for Windows and desktop Linux browsers', () => {
    expect(detectShowcasePlatform({ platform: 'Win32' })).toBe('windows-linux');
    expect(detectShowcasePlatform({ userAgentData: { platform: 'Windows' } })).toBe('windows-linux');
    expect(detectShowcasePlatform({ platform: 'Linux x86_64' })).toBe('windows-linux');
    expect(detectShowcasePlatform({ userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64)' })).toBe('windows-linux');
  });
});

describe('getShowcaseImage', () => {
  it('maps each platform and theme pair to its public screenshot path', () => {
    expect(getShowcaseImage('macos', 'light')).toEqual({
      src: '/editor-macos-light.png',
      alt: 'HackDesk on macOS in light mode, showing demonstration notes in split panes',
    });
    expect(getShowcaseImage('windows-linux', 'dark')).toEqual({
      src: '/editor-windows-linux-dark.png',
      alt: 'HackDesk on Windows and Linux in dark mode, showing demonstration notes in split panes',
    });
  });
});
