import { app } from 'electron';

import { createApplicationMenu } from './app-menu';
import { createApplicationTray } from './app-tray';
import { createAppIcon } from './app-icon';
import { registerQuickCaptureGlobalShortcut, unregisterQuickCaptureGlobalShortcut } from './global-shortcuts';
import { registerIpcHandlers } from './ipc-handlers';
import { initCrashReporter, initLogging, writeLog } from './logging';
import { registerRendererProtocol } from './renderer-protocol';
import { readStoredSettings } from './settings';
import { WindowManager } from './window-manager';

const APP_ID = 'me.eastsun.hackdesk';

const windowManager = new WindowManager();
let tray: Electron.Tray | null = null;

app.setName('HackDesk');
app.setAppUserModelId(APP_ID);
initLogging();
initCrashReporter();

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  writeLog('main', 'second instance exiting');
  app.quit();
} else {
  app.on('second-instance', () => {
    writeLog('main', 'second instance requested focus');
    windowManager.showAndFocusMainWindow();
  });
}

app.whenReady().then(async () => {
  app.dock?.setIcon(createAppIcon());
  registerRendererProtocol();
  const createMenu = (shortcuts = {}) => createApplicationMenu(
    (command) => windowManager.sendCommandToMainWindow(command),
    shortcuts,
  );
  registerIpcHandlers(windowManager, {
    onSettingsUpdated: (settings) => createMenu(settings.shortcuts),
  });
  createMenu((await readStoredSettings()).shortcuts);
  windowManager.createMainWindow();
  registerQuickCaptureGlobalShortcut(windowManager);
  tray = createApplicationTray({
    showMainWindow: () => windowManager.showAndFocusMainWindow(),
    showQuickCaptureWindow: () => windowManager.showQuickCaptureWindow(),
  });

  app.on('activate', () => {
    if (!windowManager.getMainWindow()) {
      windowManager.createMainWindow();
    }
  });
}).catch((error) => {
  writeLog('main', 'failed to start app', error, 'error');
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    writeLog('main', 'all windows closed, quitting');
    app.quit();
  }
});

app.on('before-quit', () => {
  windowManager.setAppQuitting(true);
});

app.on('will-quit', () => {
  unregisterQuickCaptureGlobalShortcut();
});

export function getTrayForTesting() {
  return tray;
}
