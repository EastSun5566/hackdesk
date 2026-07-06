import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/hackdesk-test',
  },
  screen: {
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }],
  },
}));

import { normalizeWindowState } from './window-state';

const fallbackBounds = { x: 10, y: 10, width: 1180, height: 760 };
const displays = [{ x: 0, y: 0, width: 1440, height: 900 }];

describe('window state normalization', () => {
  it('keeps visible persisted bounds', () => {
    expect(normalizeWindowState({
      bounds: { x: 200, y: 120, width: 1000, height: 700 },
      isMaximized: true,
    }, fallbackBounds, displays)).toEqual({
      bounds: { x: 200, y: 120, width: 1000, height: 700 },
      isMaximized: true,
    });
  });

  it('falls back when the persisted window is off-screen or too small', () => {
    expect(normalizeWindowState({
      bounds: { x: 5000, y: 5000, width: 1000, height: 700 },
      isMaximized: false,
    }, fallbackBounds, displays).bounds).toEqual(fallbackBounds);

    expect(normalizeWindowState({
      bounds: { x: 20, y: 20, width: 200, height: 120 },
      isMaximized: false,
    }, fallbackBounds, displays).bounds).toEqual(fallbackBounds);
  });
});
