import { app, Menu, nativeImage, Tray } from 'electron';

import { createAppIcon } from './app-icon';

type ApplicationTrayActions = {
  showMainWindow: () => void;
  showQuickCaptureWindow: () => void;
};

export function createApplicationTray({
  showMainWindow,
  showQuickCaptureWindow,
}: ApplicationTrayActions) {
  const icon = createAppIcon();
  const trayIcon = process.platform === 'darwin'
    ? icon.resize({ width: 18, height: 18, quality: 'best' })
    : icon.resize({ width: 16, height: 16, quality: 'best' });

  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
  }

  const tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip(app.getName());
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: process.platform === 'darwin' ? 'Quick Capture (⌃⌥H)' : 'Quick Capture (Ctrl+Alt+H)',
      click: showQuickCaptureWindow,
    },
    {
      label: `Show ${app.getName()}`,
      click: showMainWindow,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]));

  return tray;
}
