import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const image = {
    isEmpty: vi.fn(() => false),
    resize: vi.fn(() => image),
    setTemplateImage: vi.fn(),
  };
  const nativeThemeListeners = new Set<() => void>();
  const window = { isDestroyed: vi.fn(() => false), setIcon: vi.fn() };

  return {
    image,
    window,
    nativeThemeListeners,
    nativeTheme: {
      shouldUseDarkColors: false,
      on: vi.fn((_event: string, listener: () => void) => nativeThemeListeners.add(listener)),
      off: vi.fn((_event: string, listener: () => void) => nativeThemeListeners.delete(listener)),
    },
    createFromPath: vi.fn((_path: string) => image),
    createEmpty: vi.fn(() => ({ ...image, isEmpty: () => true })),
    setDockIcon: vi.fn(),
    existsSync: vi.fn((_path: string) => true),
  };
});

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    dock: { setIcon: mocks.setDockIcon },
  },
  BrowserWindow: { getAllWindows: () => [mocks.window] },
  nativeImage: { createFromPath: mocks.createFromPath, createEmpty: mocks.createEmpty },
  nativeTheme: mocks.nativeTheme,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, default: { ...actual, existsSync: mocks.existsSync }, existsSync: mocks.existsSync };
});

import { createTrayIcon, getAppIconPath, onAppIconChanged, setAppIcon } from './app-icon';

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform });
}

describe('app icon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform(originalPlatform);
    mocks.nativeTheme.shouldUseDarkColors = false;
    mocks.existsSync.mockReturnValue(true);
  });

  it('uses the macOS plate on macOS and the square tile elsewhere', () => {
    setPlatform('darwin');
    setAppIcon('nightly');
    expect(getAppIconPath()).toMatch(/build\/app-icons\/nightly\.png$/);

    setPlatform('win32');
    expect(getAppIconPath()).toMatch(/build\/app-icons\/nightly-square\.png$/);
  });

  it('returns no path when the variant asset is missing', () => {
    mocks.existsSync.mockReturnValue(false);
    setAppIcon('neon');
    expect(getAppIconPath()).toBeUndefined();
  });

  it('applies the icon to the dock and, off macOS, to every window', () => {
    setPlatform('linux');
    setAppIcon('blueprint');

    expect(mocks.createFromPath).toHaveBeenLastCalledWith(expect.stringMatching(/blueprint-square\.png$/));
    expect(mocks.window.setIcon).toHaveBeenCalledWith(mocks.image);

    setPlatform('darwin');
    mocks.window.setIcon.mockClear();
    setAppIcon('blueprint');
    expect(mocks.setDockIcon).toHaveBeenLastCalledWith(mocks.image);
    expect(mocks.window.setIcon).not.toHaveBeenCalled();
  });

  it('follows OS appearance changes only while the system icon is selected', () => {
    setPlatform('darwin');
    setAppIcon('system');
    expect(mocks.createFromPath).toHaveBeenLastCalledWith(expect.stringMatching(/color-light\.png$/));
    expect(mocks.nativeThemeListeners.size).toBe(1);

    mocks.nativeTheme.shouldUseDarkColors = true;
    mocks.nativeThemeListeners.forEach((listener) => listener());
    expect(mocks.createFromPath).toHaveBeenLastCalledWith(expect.stringMatching(/color-dark\.png$/));

    setAppIcon('gold');
    expect(mocks.nativeThemeListeners.size).toBe(0);
  });

  it('uses the monochrome template for the macOS menu bar', () => {
    setPlatform('darwin');
    createTrayIcon();

    expect(mocks.createFromPath).toHaveBeenLastCalledWith(expect.stringMatching(/trayTemplate\.png$/));
    expect(mocks.image.setTemplateImage).toHaveBeenCalledWith(true);
  });

  it('uses a small colored icon for the Windows and Linux tray', () => {
    setPlatform('win32');
    setAppIcon('spectrum');
    createTrayIcon();

    expect(mocks.image.resize).toHaveBeenCalledWith({ width: 16, height: 16, quality: 'best' });
    expect(mocks.image.setTemplateImage).not.toHaveBeenCalled();
  });

  it('tells listeners about each icon change until they stop listening', () => {
    const listener = vi.fn();
    const stop = onAppIconChanged(listener);
    setAppIcon('neon');
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    setAppIcon('glass');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
