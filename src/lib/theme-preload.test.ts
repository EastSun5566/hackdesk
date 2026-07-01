import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const preloadScript = indexHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1] ?? '';

function runPreloadScript() {
  new Function(preloadScript)();
}

function mockSystemDark(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('theme preload script', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '<meta name="color-scheme" content="light dark" />';
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme-preset');
    document.documentElement.removeAttribute('style');
    mockSystemDark(false);
  });

  it('uses HackMD Neo as the first-paint preset fallback', () => {
    expect(indexHtml).toContain("localStorage.getItem('theme-preset-id') || 'hackmd-neo'");

    runPreloadScript();

    expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
    expect(document.documentElement.style.backgroundColor).toBe('rgb(253, 253, 253)');
  });

  it('applies cached theme CSS and resolved dark mode before React mounts', () => {
    localStorage.setItem('theme-mode', 'dark');
    localStorage.setItem('theme-preset-id', 'gruvbox');
    localStorage.setItem('hackdesk-theme-css', ':root {\n  --background-default: #282828;\n}');

    runPreloadScript();

    expect(document.getElementById('hackdesk-theme-preload')).toHaveTextContent('--background-default: #282828;');
    expect(document.documentElement.dataset.themePreset).toBe('gruvbox');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
    expect(document.documentElement.style.backgroundColor).toBe('rgb(40, 40, 40)');
  });

  it('resolves system mode from prefers-color-scheme', () => {
    mockSystemDark(true);

    runPreloadScript();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  });
});
