import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async importOriginal => {
  const fs = {
    ...await importOriginal<typeof import('node:fs')>(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return { ...fs, default: fs };
});
vi.mock('./logging', () => ({ writeLog: vi.fn() }));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/hackdesk-test',
  },
  screen: {
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }],
  },
}));

import { normalizeWindowState, persistWindowState } from './window-state';
import { writeLog } from './logging';

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

describe('window state persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(writeFileSync).mockReset();
    vi.mocked(writeLog).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  function createWindow() {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      getBounds: vi.fn(() => fallbackBounds),
      isMaximized: vi.fn(() => false),
    });
    persistWindowState(window as unknown as BrowserWindow);
    return window;
  }

  it('debounces geometry changes and flushes on normal close', () => {
    const window = createWindow();
    window.emit('resize');
    window.emit('move');
    vi.advanceTimersByTime(250);
    expect(writeFileSync).toHaveBeenCalledOnce();
    expect(JSON.parse(String(vi.mocked(writeFileSync).mock.calls[0][1]))).toEqual({ bounds: fallbackBounds, isMaximized: false });
    window.emit('resize');
    window.emit('close');
    vi.advanceTimersByTime(250);
    expect(writeFileSync).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])('never reads bounds after destroy, even if closed cleanup runs: %s', emitsClosed => {
    const window = createWindow();
    window.emit('resize');
    window.isDestroyed.mockReturnValue(true);
    if (emitsClosed) window.emit('closed');
    vi.advanceTimersByTime(250);
    expect(window.getBounds).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs a failed write without throwing from the timer or close handler', () => {
    const window = createWindow();
    const error = new Error('Storage unavailable');
    vi.mocked(writeFileSync).mockImplementation(() => { throw error; });
    window.emit('move');
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
    expect(() => window.emit('close')).not.toThrow();
    expect(writeLog).toHaveBeenCalledWith('main', 'failed to persist window state', error, 'warn');
  });
});
