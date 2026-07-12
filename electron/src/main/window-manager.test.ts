import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ELECTRON_CHANNELS } from '../shared/channels';

const mockState = vi.hoisted(() => {
  class Emitter {
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    on(event: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    once(event: string, listener: (...args: unknown[]) => void) {
      const onceListener = (...args: unknown[]) => {
        this.removeListener(event, onceListener);
        listener(...args);
      };
      return this.on(event, onceListener);
    }

    removeListener(event: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(event) ?? [];
      this.listeners.set(event, listeners.filter((candidate) => candidate !== listener));
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    }
  }

  const state = {
    lastWindow: null as unknown,
    windows: [] as BrowserWindowMock[],
    appHide: vi.fn(() => {
      state.lastWindow = null;
    }),
    appShow: vi.fn(),
    cursorPoint: { x: 1800, y: 120 },
    cursorScreenPointError: false,
    cursorDisplay: {
      workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
    },
    primaryDisplay: {
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    },
    writeLog: vi.fn(),
  };

  class BrowserWindowMock extends Emitter {
    static getFocusedWindow = vi.fn(() => state.lastWindow);

    isDestroyedValue = false;
    destroy = vi.fn(() => {
      this.isDestroyedValue = true;
      this.emit('closed');
    });
    close = vi.fn(() => {
      let prevented = false;
      this.emit('close', { preventDefault: vi.fn(() => { prevented = true; }) });
      if (!prevented) {
        this.destroy();
      }
    });
    visibleValue = false;
    hide = vi.fn(() => {
      this.visibleValue = false;
      if (state.lastWindow === this) {
        state.lastWindow = null;
      }
    });
    loadURL = vi.fn();
    maximize = vi.fn();
    show = vi.fn(() => { this.visibleValue = true; });
    focus = vi.fn(() => {
      state.lastWindow = this;
      this.emit('focus');
    });
    restore = vi.fn();
    isFocused = vi.fn(() => state.lastWindow === this);
    isVisible = vi.fn(() => this.visibleValue);
    isMinimized = vi.fn(() => false);
    isDestroyed = vi.fn(() => this.isDestroyedValue);
    isLoadingValue = false;
    options: unknown;
    webContents = Object.assign(new Emitter(), {
      id: 1,
      mainFrame: {},
      session: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      },
      isDestroyed: vi.fn(() => false),
      isLoading: vi.fn(() => this.isLoadingValue),
      getURL: vi.fn(() => 'hackdesk://renderer/index.html'),
      send: vi.fn(),
      setIgnoreMenuShortcuts: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    });

    constructor(options?: unknown) {
      super();
      this.options = options;
      state.lastWindow = this;
      state.windows.push(this);
    }
  }

  return { BrowserWindowMock, state };
});

vi.mock('electron', () => ({
  app: {
    getName: () => 'HackDesk',
    hide: mockState.state.appHide,
    quit: vi.fn(),
    relaunch: vi.fn(),
    show: mockState.state.appShow,
    exit: vi.fn(),
  },
  BrowserWindow: mockState.BrowserWindowMock,
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 3 })),
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => {
      if (mockState.state.cursorScreenPointError) {
        throw new Error('Cursor position unavailable');
      }
      return mockState.state.cursorPoint;
    }),
    getDisplayNearestPoint: vi.fn(() => mockState.state.cursorDisplay),
    getPrimaryDisplay: vi.fn(() => mockState.state.primaryDisplay),
  },
}));

vi.mock('./paths', () => ({
  getRendererEntryUrl: () => 'hackdesk://renderer/index.html',
  getRendererRouteUrl: (route: string) => `hackdesk://renderer/index.html#${route}`,
}));

vi.mock('./url-policy', () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('./app-icon', () => ({
  getAppIconPath: () => '/tmp/icon.png',
}));

vi.mock('./logging', () => ({
  exportDebugLogs: vi.fn(),
  writeLog: mockState.state.writeLog,
}));

vi.mock('./renderer-url', () => ({
  isTrustedRendererUrl: () => true,
}));

vi.mock('./unresponsive-sampler', () => ({
  createUnresponsiveSampler: () => ({
    start: vi.fn(),
    stopAndFlush: vi.fn(),
  }),
}));

vi.mock('./window-state', () => ({
  persistWindowState: vi.fn(),
  readWindowState: (fallback: unknown) => ({ bounds: fallback, isMaximized: false }),
}));

import { WindowManager } from './window-manager';

function createManagerWithWindow() {
  const manager = new WindowManager();
  const window = manager.createMainWindow() as InstanceType<typeof mockState.BrowserWindowMock>;
  return { manager, window };
}

function emitClose(window: InstanceType<typeof mockState.BrowserWindowMock>) {
  const event = { preventDefault: vi.fn() };
  window.emit('close', event);
  return event;
}

describe('WindowManager close intent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockState.state.lastWindow = null;
    mockState.state.windows = [];
    mockState.state.appHide.mockClear();
    mockState.state.appShow.mockClear();
    mockState.state.cursorScreenPointError = false;
    mockState.state.writeLog.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('updates native menu shortcut handling for the active renderer', () => {
    const { manager, window } = createManagerWithWindow();

    manager.setMenuShortcutsIgnored(true);
    manager.setMenuShortcutsIgnored(false);

    expect(window.webContents.setIgnoreMenuShortcuts).toHaveBeenNthCalledWith(1, true);
    expect(window.webContents.setIgnoreMenuShortcuts).toHaveBeenNthCalledWith(2, false);
  });

  it('sends a close request instead of closing immediately', () => {
    const { window } = createManagerWithWindow();

    const event = emitClose(window);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(window.webContents.send).toHaveBeenCalledWith(ELECTRON_CHANNELS.appCloseRequested, {
      source: 'window-button',
    });
    expect(window.destroy).not.toHaveBeenCalled();
  });

  it('bypasses close interception during app quit', () => {
    const { manager, window } = createManagerWithWindow();
    manager.setAppQuitting(true);

    const event = emitClose(window);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(window.webContents.send).not.toHaveBeenCalledWith(ELECTRON_CHANNELS.appCloseRequested, expect.anything());
  });

  it('marks Cmd/Ctrl+W close requests as keyboard shortcut sourced', () => {
    const { window } = createManagerWithWindow();

    window.webContents.emit('before-input-event', {}, {
      type: 'keyDown',
      key: 'w',
      control: true,
      meta: true,
    });
    emitClose(window);

    expect(window.webContents.send).toHaveBeenCalledWith(ELECTRON_CHANNELS.appCloseRequested, {
      source: 'keyboard-shortcut',
    });
  });

  it('forces close when the renderer does not answer', async () => {
    const { window } = createManagerWithWindow();

    emitClose(window);
    await vi.advanceTimersByTimeAsync(3000);

    expect(window.destroy).toHaveBeenCalledTimes(1);
    expect(mockState.state.writeLog).toHaveBeenCalledWith(
      'main',
      'renderer did not respond to close request; forcing window close',
      undefined,
      'warn',
    );
  });

  it('clears pending fallback when renderer cancels close', async () => {
    const { manager, window } = createManagerWithWindow();

    emitClose(window);
    manager.cancelClose();
    await vi.advanceTimersByTimeAsync(3000);

    expect(window.destroy).not.toHaveBeenCalled();
  });

  it('clears pending fallback and destroys the window when renderer confirms close', async () => {
    const { manager, window } = createManagerWithWindow();

    emitClose(window);
    manager.confirmClose();
    await vi.advanceTimersByTimeAsync(3000);

    expect(window.destroy).toHaveBeenCalledTimes(1);
  });

  it('opens and focuses a reusable quick capture window', () => {
    const { manager } = createManagerWithWindow();

    const firstCapture = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;
    const secondCapture = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;

    expect(firstCapture).toBe(secondCapture);
    expect(firstCapture.loadURL).toHaveBeenCalledWith('hackdesk://renderer/index.html#/quick-capture');
    expect(firstCapture.options).toEqual(expect.objectContaining({ x: 2190, y: 194 }));
    expect(secondCapture.show).toHaveBeenCalledOnce();
    expect(secondCapture.focus).toHaveBeenCalledOnce();
    expect(mockState.state.windows).toHaveLength(2);
  });

  it('keeps main hidden across external quick capture dismissal and reopening', () => {
    const { manager, window } = createManagerWithWindow();
    mockState.state.lastWindow = null;
    window.show.mockClear();
    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;

    expect(window.hide).toHaveBeenCalledTimes(2);
    manager.handleAppActivation();
    expect(window.show).not.toHaveBeenCalled();

    const closeEvent = emitClose(captureWindow);

    expect(closeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(captureWindow.hide).toHaveBeenCalledOnce();
    expect(captureWindow.destroy).not.toHaveBeenCalled();
    expect(mockState.state.appHide).toHaveBeenCalledOnce();
    expect(manager.showQuickCaptureWindow()).toBe(captureWindow);
    expect(window.show).not.toHaveBeenCalled();
    expect(window.hide).toHaveBeenCalledTimes(4);
  });

  it('shows main on app activation only after external quick capture is hidden', () => {
    const { manager, window } = createManagerWithWindow();
    mockState.state.lastWindow = null;
    window.show.mockClear();
    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;
    captureWindow.emit('ready-to-show');

    manager.handleAppActivation();
    expect(window.show).not.toHaveBeenCalled();

    manager.hideQuickCaptureWindow();
    manager.handleAppActivation();

    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it('returns focus to main when quick capture was opened from main', () => {
    const { manager, window } = createManagerWithWindow();
    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;
    window.show.mockClear();
    window.focus.mockClear();

    manager.hideQuickCaptureWindow();

    expect(captureWindow.hide).toHaveBeenCalledOnce();
    expect(window.hide).not.toHaveBeenCalled();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(mockState.state.appHide).not.toHaveBeenCalled();
  });

  it('allows quick capture to close while the app is quitting', () => {
    const { manager } = createManagerWithWindow();
    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;
    manager.setAppQuitting(true);

    captureWindow.close();

    expect(captureWindow.hide).not.toHaveBeenCalled();
    expect(captureWindow.destroy).toHaveBeenCalledOnce();
  });

  it('falls back to the primary display when cursor display lookup is unavailable', () => {
    const { manager } = createManagerWithWindow();
    mockState.state.cursorScreenPointError = true;

    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;

    expect(captureWindow.options).toEqual(expect.objectContaining({ x: 510, y: 162 }));
  });

  it('submits quick capture in the background and focuses main only after acceptance', async () => {
    const { manager, window } = createManagerWithWindow();
    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;

    window.show.mockClear();
    window.focus.mockClear();
    const submission = manager.submitQuickCapture('  # Capture  ');
    const command = window.webContents.send.mock.calls.find(([channel]) => (
      channel === ELECTRON_CHANNELS.appCommand
    ))?.[1];

    expect(command).toEqual(expect.objectContaining({
      type: 'quick-capture:create-draft',
      content: '  # Capture  ',
      requestId: expect.any(String),
      expiresAt: expect.any(Number),
    }));
    expect(captureWindow.hide).not.toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();

    manager.resolveQuickCaptureSubmission({ requestId: command.requestId, accepted: true });

    await expect(submission).resolves.toEqual({ accepted: true });
    expect(captureWindow.hide).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it('keeps quick capture open when the main window rejects the submission', async () => {
    const { manager, window } = createManagerWithWindow();
    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;
    window.show.mockClear();
    const submission = manager.submitQuickCapture('# Capture');
    const command = window.webContents.send.mock.calls.find(([channel]) => (
      channel === ELECTRON_CHANNELS.appCommand
    ))?.[1];

    manager.resolveQuickCaptureSubmission({
      requestId: command.requestId,
      accepted: false,
      error: 'Connect HackMD in Settings before capturing here.',
    });

    await expect(submission).resolves.toEqual({
      accepted: false,
      error: 'Connect HackMD in Settings before capturing here.',
    });
    expect(captureWindow.hide).not.toHaveBeenCalled();
    expect(captureWindow.focus).toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();
  });

  it('ignores unknown quick capture acknowledgements', () => {
    const { manager } = createManagerWithWindow();

    expect(() => manager.resolveQuickCaptureSubmission({
      requestId: 'unknown-request',
      accepted: true,
    })).not.toThrow();
    expect(mockState.state.writeLog).toHaveBeenCalledWith(
      'main',
      'received unknown quick capture submission acknowledgement',
      { requestId: 'unknown-request' },
      'warn',
    );
  });

  it('sends app menu commands to the main window when quick capture is focused', () => {
    const { manager, window } = createManagerWithWindow();
    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;

    expect(mockState.BrowserWindowMock.getFocusedWindow()).toBe(captureWindow);

    manager.sendCommandToMainWindow({ type: 'refresh' });

    expect(window.webContents.send).toHaveBeenCalledWith(ELECTRON_CHANNELS.appCommand, { type: 'refresh' });
    expect(captureWindow.webContents.send).not.toHaveBeenCalledWith(ELECTRON_CHANNELS.appCommand, expect.anything());
  });

  it('drops expired queued quick capture commands and preserves the submission', async () => {
    const { manager, window } = createManagerWithWindow();
    window.isLoadingValue = true;

    const submission = manager.submitQuickCapture('# Later');

    expect(window.webContents.send).not.toHaveBeenCalledWith(ELECTRON_CHANNELS.appCommand, expect.anything());

    await vi.advanceTimersByTimeAsync(15_000);
    await expect(submission).resolves.toEqual({
      accepted: false,
      error: 'Quick Capture did not reach HackDesk. Your text is still here.',
    });

    window.isLoadingValue = false;
    window.webContents.emit('did-finish-load');

    expect(window.webContents.send).not.toHaveBeenCalledWith(ELECTRON_CHANNELS.appCommand, expect.objectContaining({
      type: 'quick-capture:create-draft',
    }));
  });
});
