import { app, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function getAppIconPath() {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'assets/icon.png')]
    : [
      join(__dirname, '../../build/icon.png'),
      join(__dirname, '../../docs/public/logo.png'),
      join(__dirname, '../../src-tauri/icons/icon.png'),
    ];

  return candidates.find((candidate) => existsSync(candidate));
}

export function createAppIcon() {
  const iconPath = getAppIconPath();
  return iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}
