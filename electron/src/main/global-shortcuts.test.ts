import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  globalShortcut: {
    register: vi.fn(),
    unregister: vi.fn(),
  },
  writeLog: vi.fn(),
}));

vi.mock('electron', () => ({
  globalShortcut: mocks.globalShortcut,
}));

vi.mock('./logging', () => ({
  writeLog: mocks.writeLog,
}));

import {
  getQuickCaptureShortcutStatus,
  QUICK_CAPTURE_GLOBAL_SHORTCUT,
  registerQuickCaptureGlobalShortcut,
  unregisterQuickCaptureGlobalShortcut,
} from './global-shortcuts';

describe('quick capture global shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.globalShortcut.register.mockReturnValue(true);
    unregisterQuickCaptureGlobalShortcut(mocks.globalShortcut);
    mocks.globalShortcut.unregister.mockClear();
  });

  it('registers Control+Alt+H and opens quick capture when triggered', () => {
    const windowManager = { showQuickCaptureWindow: vi.fn() };

    const registered = registerQuickCaptureGlobalShortcut(windowManager as never, mocks.globalShortcut);

    expect(registered).toBe(true);
    expect(mocks.globalShortcut.register).toHaveBeenCalledWith(
      QUICK_CAPTURE_GLOBAL_SHORTCUT,
      expect.any(Function),
    );

    const callback = mocks.globalShortcut.register.mock.calls[0]?.[1];
    callback?.();

    expect(windowManager.showQuickCaptureWindow).toHaveBeenCalledOnce();
    expect(getQuickCaptureShortcutStatus()).toEqual({
      accelerator: 'Control+Alt+H',
      registered: true,
    });
  });

  it('logs a warning when registration fails without throwing', () => {
    const windowManager = { showQuickCaptureWindow: vi.fn() };
    mocks.globalShortcut.register.mockReturnValueOnce(false);

    const registered = registerQuickCaptureGlobalShortcut(windowManager as never, mocks.globalShortcut);

    expect(registered).toBe(false);
    expect(mocks.writeLog).toHaveBeenCalledWith(
      'main',
      'failed to register quick capture global shortcut',
      { accelerator: 'Control+Alt+H' },
      'warn',
    );
    expect(getQuickCaptureShortcutStatus()).toEqual({
      accelerator: 'Control+Alt+H',
      registered: false,
    });
  });

  it('unregisters the quick capture shortcut', () => {
    const windowManager = { showQuickCaptureWindow: vi.fn() };
    registerQuickCaptureGlobalShortcut(windowManager as never, mocks.globalShortcut);

    unregisterQuickCaptureGlobalShortcut(mocks.globalShortcut);

    expect(mocks.globalShortcut.unregister).toHaveBeenCalledWith(QUICK_CAPTURE_GLOBAL_SHORTCUT);
    expect(getQuickCaptureShortcutStatus()).toEqual({
      accelerator: 'Control+Alt+H',
      registered: false,
    });
  });
});
