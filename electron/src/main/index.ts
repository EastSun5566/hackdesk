import { app, BrowserWindow } from 'electron';

import { createApplicationMenu } from './app-menu';
import { createApplicationTray } from './app-tray';
import { createAppIcon } from './app-icon';
import { registerIpcHandlers } from './ipc-handlers';
import { initCrashReporter, initLogging, writeLog } from './logging';
import { registerRendererProtocol } from './renderer-protocol';
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

app.whenReady().then(() => {
  app.dock?.setIcon(createAppIcon());
  registerRendererProtocol();
  registerIpcHandlers(windowManager);
  createApplicationMenu((command) => windowManager.sendCommand(command));
  windowManager.createMainWindow();
  tray = createApplicationTray(() => windowManager.showAndFocusMainWindow());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
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

export function getTrayForTesting() {
  return tray;
}
