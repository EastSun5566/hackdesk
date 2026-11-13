import { app, Menu, nativeImage, Tray } from 'electron';

import { displayShortcutConfig } from '../../../src/lib/keyboard-shortcuts';
import { DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT } from '../../../src/lib/quick-capture-shortcuts';
import { createTrayIcon, onAppIconChanged } from './app-icon';

type ApplicationTrayActions = {
  showMainWindow: () => void;
  showQuickCaptureWindow: () => void;
};

export function createApplicationTray(
  actions: ApplicationTrayActions,
  quickHackShortcut: string = DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT,
) {
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
  setApplicationTrayMenu(tray, actions, quickHackShortcut);

  return tray;
}

/** Builds the tray menu; called again when the Quick Hack hotkey changes in Settings. */
export function setApplicationTrayMenu(
  tray: Tray,
  { showMainWindow, showQuickCaptureWindow }: ApplicationTrayActions,
  quickHackShortcut: string,
) {
  if (tray.isDestroyed()) return;
  const shortcutLabel = displayShortcutConfig(quickHackShortcut, process.platform);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: shortcutLabel ? `Quick Hack (${shortcutLabel})` : 'Quick Hack',
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
}
