import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_APP_ICON,
  resolveAppIconVariant,
  type AppIconId,
  type AppIconVariantId,
} from '../../../src/lib/app-icons';

let currentAppIcon: AppIconId = DEFAULT_APP_ICON;
let followsSystemTheme = false;

function getAppIconsDir() {
  return app.isPackaged
    ? join(process.resourcesPath, 'assets/app-icons')
    : join(__dirname, '../../build/app-icons');
}

function getCurrentVariant(): AppIconVariantId {
  return resolveAppIconVariant(currentAppIcon, nativeTheme.shouldUseDarkColors);
}

/**
 * Path of the current icon variant. macOS gets the plate drawn on Apple's icon
 * grid; Windows and Linux get the near full-bleed tile.
 */
export function getAppIconPath() {
  const suffix = process.platform === 'darwin' ? '' : '-square';
  const candidate = join(getAppIconsDir(), `${getCurrentVariant()}${suffix}.png`);
  return existsSync(candidate) ? candidate : undefined;
}

export function createAppIcon() {
  const iconPath = getAppIconPath();
  return iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}

/** Menu bar / system tray icon. macOS uses a monochrome template the OS tints. */
export function createTrayIcon() {
  if (process.platform === 'darwin') {
    const templatePath = join(getAppIconsDir(), 'trayTemplate.png');
    if (existsSync(templatePath)) {
      const image = nativeImage.createFromPath(templatePath);
      image.setTemplateImage(true);
      return image;
    }
  }

  const icon = createAppIcon();
  return icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16, quality: 'best' });
}

const appIconListeners = new Set<() => void>();

/** Calls `listener` after each icon change, so surfaces built from the icon (the tray) can follow it. */
export function onAppIconChanged(listener: () => void) {
  appIconListeners.add(listener);
  return () => {
    appIconListeners.delete(listener);
  };
}

function applyAppIcon() {
  const icon = createAppIcon();
  if (icon.isEmpty()) {
    return;
  }

  app.dock?.setIcon(icon);
  if (process.platform !== 'darwin') {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.setIcon(icon);
      }
    }
  }
  for (const listener of appIconListeners) listener();
}

function handleNativeThemeUpdated() {
  applyAppIcon();
}

/**
 * Switches the running app's dock and window icons. The packaged icon shown by
 * Finder, Explorer, and the Dock while the app is closed stays the build-time one.
 */
export function setAppIcon(id: AppIconId) {
  currentAppIcon = id;
  const shouldFollow = id === 'system';
  if (shouldFollow !== followsSystemTheme) {
    followsSystemTheme = shouldFollow;
    if (shouldFollow) {
      nativeTheme.on('updated', handleNativeThemeUpdated);
    } else {
      nativeTheme.off('updated', handleNativeThemeUpdated);
    }
  }
  applyAppIcon();
}
