import { afterEach, describe, expect, it } from 'vitest';

import {
  applySidebarTranslucency,
  applyWindowVibrancy,
  readSidebarTranslucency,
  setSidebarTranslucency,
  SIDEBAR_TRANSLUCENCY_KEY,
} from './sidebar-translucency-preference';

describe('sidebar translucency preference', () => {
  afterEach(() => {
    window.localStorage.removeItem(SIDEBAR_TRANSLUCENCY_KEY);
    delete document.documentElement.dataset.sidebarTranslucency;
    delete document.documentElement.dataset.windowVibrancy;
  });

  it('is off by default and marks nothing on the root', () => {
    expect(readSidebarTranslucency()).toBe('off');
    applySidebarTranslucency();
    expect(document.documentElement.dataset.sidebarTranslucency).toBeUndefined();
  });

  it('applies and remembers a level, and clears it when turned off', () => {
    setSidebarTranslucency('medium');
    expect(document.documentElement.dataset.sidebarTranslucency).toBe('medium');
    expect(readSidebarTranslucency()).toBe('medium');
    setSidebarTranslucency('off');
    expect(document.documentElement.dataset.sidebarTranslucency).toBeUndefined();
  });

  it('reads an unknown stored value as off', () => {
    window.localStorage.setItem(SIDEBAR_TRANSLUCENCY_KEY, 'glass');
    expect(readSidebarTranslucency()).toBe('off');
  });

  it('marks the window as having a material only on macOS', () => {
    applyWindowVibrancy('darwin');
    expect(document.documentElement.dataset.windowVibrancy).toBe('');
    applyWindowVibrancy('win32');
    expect(document.documentElement.dataset.windowVibrancy).toBeUndefined();
  });
});
