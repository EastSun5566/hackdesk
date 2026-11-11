import { beforeEach, describe, expect, it, vi } from 'vitest';

const trayMocks = vi.hoisted(() => {
  const image = {
    isEmpty: vi.fn(() => false),
    resize: vi.fn(() => image),
    setTemplateImage: vi.fn(),
  };
  const tray = {
    isDestroyed: vi.fn(() => false),
    setContextMenu: vi.fn(),
    setImage: vi.fn(),
    setToolTip: vi.fn(),
  };
  const iconListeners: Array<() => void> = [];

  return {
    buildFromTemplate: vi.fn((template: unknown) => template),
    createEmpty: vi.fn(() => image),
    iconListeners,
    image,
    quit: vi.fn(),
    tray,
    Tray: vi.fn(function TrayMock() {
      return tray;
    }),
  };
});

vi.mock('electron', () => ({
  app: {
    getName: () => 'HackDesk',
    quit: trayMocks.quit,
  },
  Menu: {
    buildFromTemplate: trayMocks.buildFromTemplate,
  },
  nativeImage: {
    createEmpty: trayMocks.createEmpty,
  },
  Tray: trayMocks.Tray,
}));

vi.mock('./app-icon', () => ({
  createTrayIcon: () => trayMocks.image,
  onAppIconChanged: (listener: () => void) => {
    trayMocks.iconListeners.push(listener);
    return () => trayMocks.iconListeners.splice(trayMocks.iconListeners.indexOf(listener), 1);
  },
}));

import { createApplicationTray } from './app-tray';

function currentTemplate() {
  return trayMocks.buildFromTemplate.mock.calls.at(-1)?.[0] as Electron.MenuItemConstructorOptions[];
}

describe('createApplicationTray', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trayMocks.iconListeners.length = 0;
    trayMocks.tray.isDestroyed.mockReturnValue(false);
    trayMocks.image.isEmpty.mockReturnValue(false);
    trayMocks.image.resize.mockReturnValue(trayMocks.image);
  });

  it('adds quick capture before the main window action', () => {
    const showMainWindow = vi.fn();
    const showQuickCaptureWindow = vi.fn();

    createApplicationTray({ showMainWindow, showQuickCaptureWindow });

    const template = currentTemplate();
    expect(template[0]?.label).toContain('Quick Hack');
    expect(template[1]).toMatchObject({ label: 'Show HackDesk' });

    template[0]?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
    template[1]?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);

    expect(showQuickCaptureWindow).toHaveBeenCalledOnce();
    expect(showMainWindow).toHaveBeenCalledOnce();
  });

  it('keeps the quit action after a separator', () => {
    createApplicationTray({
      showMainWindow: vi.fn(),
      showQuickCaptureWindow: vi.fn(),
    });

    const template = currentTemplate();
    expect(template[2]).toMatchObject({ type: 'separator' });
    expect(template[3]).toMatchObject({ label: 'Quit' });

    template[3]?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);

    expect(trayMocks.quit).toHaveBeenCalledOnce();
  });

  it('follows app icon changes outside macOS, and stops once the tray is gone', () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      createApplicationTray({ showMainWindow: vi.fn(), showQuickCaptureWindow: vi.fn() });
      expect(trayMocks.iconListeners).toHaveLength(1);

      trayMocks.iconListeners[0]();
      expect(trayMocks.tray.setImage).toHaveBeenCalledWith(trayMocks.image);

      trayMocks.tray.isDestroyed.mockReturnValue(true);
      trayMocks.iconListeners[0]();
      expect(trayMocks.tray.setImage).toHaveBeenCalledTimes(1);
      expect(trayMocks.iconListeners).toHaveLength(0);
    } finally {
      Object.defineProperty(process, 'platform', { value: platform });
    }
  });

  it('keeps the fixed menu bar template on macOS', () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      createApplicationTray({ showMainWindow: vi.fn(), showQuickCaptureWindow: vi.fn() });
      expect(trayMocks.iconListeners).toHaveLength(0);
    } finally {
      Object.defineProperty(process, 'platform', { value: platform });
    }
  });
});
