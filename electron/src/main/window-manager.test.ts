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
      this.emit('close', { preventDefault: vi.fn() });
      this.destroy();
    });
    loadURL = vi.fn();
    maximize = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
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
    quit: vi.fn(),
    relaunch: vi.fn(),
    exit: vi.fn(),
  },
  BrowserWindow: mockState.BrowserWindowMock,
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 3 })),
  },
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    }),
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
    expect(secondCapture.show).toHaveBeenCalledOnce();
    expect(secondCapture.focus).toHaveBeenCalledOnce();
    expect(mockState.state.windows).toHaveLength(2);
  });

  it('submits quick capture content to the main window and closes capture', () => {
    const { manager, window } = createManagerWithWindow();
    const captureWindow = manager.showQuickCaptureWindow() as InstanceType<typeof mockState.BrowserWindowMock>;

    manager.submitQuickCapture('  # Capture  ');

    expect(captureWindow.close).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
    expect(window.webContents.send).toHaveBeenCalledWith(ELECTRON_CHANNELS.appCommand, {
      type: 'quick-capture:create-draft',
      content: '# Capture',
    });
  });

  it('queues quick capture commands until a newly-created main window finishes loading', () => {
    const { manager, window } = createManagerWithWindow();
    window.isLoadingValue = true;

    manager.submitQuickCapture('# Later');

    expect(window.webContents.send).not.toHaveBeenCalledWith(ELECTRON_CHANNELS.appCommand, expect.anything());

    window.isLoadingValue = false;
    window.webContents.emit('did-finish-load');

    expect(window.webContents.send).toHaveBeenCalledWith(ELECTRON_CHANNELS.appCommand, {
      type: 'quick-capture:create-draft',
      content: '# Later',
    });
  });
});
