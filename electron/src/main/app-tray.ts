import { app, Menu, nativeImage, Tray } from 'electron';

import { createTrayIcon, onAppIconChanged } from './app-icon';

type ApplicationTrayActions = {
  showMainWindow: () => void;
  showQuickCaptureWindow: () => void;
};

export function createApplicationTray({
  showMainWindow,
  showQuickCaptureWindow,
}: ApplicationTrayActions) {
  const trayIcon = createTrayIcon();

  const tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip(app.getName());
  // The macOS menu bar uses a fixed template; elsewhere the tray shows the chosen icon and follows it.
  if (process.platform !== 'darwin') {
    const stopFollowingIcon = onAppIconChanged(() => {
      if (tray.isDestroyed()) {
        stopFollowingIcon();
        return;
      }
      const next = createTrayIcon();
      if (!next.isEmpty()) tray.setImage(next);
    });
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: process.platform === 'darwin' ? 'Quick Hack (⌃⌥H)' : 'Quick Hack (Ctrl+Alt+H)',
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
