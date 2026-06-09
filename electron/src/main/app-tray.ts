import { app, Menu, nativeImage, Tray } from 'electron';

import { createAppIcon } from './app-icon';

type ShowMainWindow = () => void;

export function createApplicationTray(showMainWindow: ShowMainWindow) {
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
