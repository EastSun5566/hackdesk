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
  registerQuickCaptureGlobalShortcut,
  unregisterQuickCaptureGlobalShortcut,
} from './global-shortcuts';

describe('quick capture global shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.globalShortcut.register.mockReturnValue(true);
    unregisterQuickCaptureGlobalShortcut(mocks.globalShortcut);
    registerQuickCaptureGlobalShortcut({ toggleQuickCaptureWindow: vi.fn() }, 'none', mocks.globalShortcut);
    vi.clearAllMocks();
    mocks.globalShortcut.register.mockReturnValue(true);
  });

  it('registers Control+Alt+H by default and toggles quick capture when triggered', () => {
    const windowManager = { toggleQuickCaptureWindow: vi.fn() };

    const registered = registerQuickCaptureGlobalShortcut(windowManager, undefined, mocks.globalShortcut);

    expect(registered).toBe(true);
    expect(mocks.globalShortcut.register).toHaveBeenCalledWith('Control+Alt+H', expect.any(Function));

    const callback = mocks.globalShortcut.register.mock.calls[0]?.[1];
    callback?.();

    expect(windowManager.toggleQuickCaptureWindow).toHaveBeenCalledOnce();
    expect(getQuickCaptureShortcutStatus()).toEqual({ shortcut: 'control+alt+h', registered: true });
  });

  it('logs a warning when registration fails without throwing', () => {
    const windowManager = { toggleQuickCaptureWindow: vi.fn() };
    mocks.globalShortcut.register.mockReturnValueOnce(false);

    const registered = registerQuickCaptureGlobalShortcut(windowManager, 'control+alt+h', mocks.globalShortcut);

    expect(registered).toBe(false);
    expect(mocks.writeLog).toHaveBeenCalledWith(
      'main',
      'failed to register Quick Hack global shortcut',
      { accelerator: 'Control+Alt+H' },
      'warn',
    );
    expect(getQuickCaptureShortcutStatus()).toEqual({ shortcut: 'control+alt+h', registered: false });

    // The next settings save retries, in case the other app let the keys go.
    expect(registerQuickCaptureGlobalShortcut(windowManager, 'control+alt+h', mocks.globalShortcut)).toBe(true);
    expect(getQuickCaptureShortcutStatus()).toEqual({ shortcut: 'control+alt+h', registered: true });
  });

  it('survives an accelerator the system rejects', () => {
    mocks.globalShortcut.register.mockImplementationOnce(() => {
      throw new Error('Invalid accelerator');
    });

    expect(registerQuickCaptureGlobalShortcut({ toggleQuickCaptureWindow: vi.fn() }, 'mod+alt+q', mocks.globalShortcut)).toBe(false);
    expect(getQuickCaptureShortcutStatus()).toEqual({ shortcut: 'mod+alt+q', registered: false });
  });

  it('moves to a hotkey chosen in Settings and lets the old keys go', () => {
    const windowManager = { toggleQuickCaptureWindow: vi.fn() };
    registerQuickCaptureGlobalShortcut(windowManager, 'control+alt+h', mocks.globalShortcut);

    expect(registerQuickCaptureGlobalShortcut(windowManager, 'control+shift+space', mocks.globalShortcut)).toBe(true);
    expect(mocks.globalShortcut.unregister).toHaveBeenCalledWith('Control+Alt+H');
    expect(mocks.globalShortcut.register).toHaveBeenLastCalledWith('Control+Shift+Space', expect.any(Function));
    expect(getQuickCaptureShortcutStatus()).toEqual({ shortcut: 'control+shift+space', registered: true });

    // Applied again unchanged (any settings save), it stays registered without re-registering.
    registerQuickCaptureGlobalShortcut(windowManager, 'control+shift+space', mocks.globalShortcut);
    expect(mocks.globalShortcut.register).toHaveBeenCalledTimes(2);

    // Turned off, the keys go back to other apps.
    expect(registerQuickCaptureGlobalShortcut(windowManager, 'none', mocks.globalShortcut)).toBe(false);
    expect(mocks.globalShortcut.unregister).toHaveBeenLastCalledWith('Control+Shift+Space');
    expect(mocks.globalShortcut.register).toHaveBeenCalledTimes(2);
    expect(getQuickCaptureShortcutStatus()).toEqual({ shortcut: 'none', registered: false });
  });

  it('unregisters the quick capture shortcut', () => {
    registerQuickCaptureGlobalShortcut({ toggleQuickCaptureWindow: vi.fn() }, 'control+alt+h', mocks.globalShortcut);

    unregisterQuickCaptureGlobalShortcut(mocks.globalShortcut);

    expect(mocks.globalShortcut.unregister).toHaveBeenCalledWith('Control+Alt+H');
    expect(getQuickCaptureShortcutStatus()).toEqual({ shortcut: 'control+alt+h', registered: false });
  });
});
