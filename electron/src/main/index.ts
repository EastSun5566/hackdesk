import type { ElectronSafeSettings } from '../../../src/lib/electron-api';
import type { WindowWorkspaceScope } from '../../../src/lib/window-workspace';
import { app, type BrowserWindow } from 'electron';

import { attachWindowMenu, createApplicationMenu, type ApplicationMenuOptions } from './app-menu';
import { createApplicationTray } from './app-tray';
import { setAppIcon } from './app-icon';
import { updateDockMenu } from './dock-menu';
import { keepE2EWindowsInBackground } from './e2e-background-windows';
import { registerQuickCaptureGlobalShortcut, unregisterQuickCaptureGlobalShortcut } from './global-shortcuts';
import { registerIpcHandlers } from './ipc-handlers';
import { initCrashReporter, initLogging, writeLog } from './logging';
import { registerRendererProtocol } from './renderer-protocol';
import { readStoredSettings } from './settings';
import { ensureReadableSettings } from './settings-recovery';
import { WindowManager } from './window-manager';

const APP_ID = 'me.eastsun.hackdesk';

keepE2EWindowsInBackground();

const windowManager = new WindowManager();
let tray: Electron.Tray | null = null;
let disposeIpcHandlers: (() => void) | null = null;
// Windows must not open before settings are readable; the renderer depends on them.
let startupComplete = false;
let latestMenuSettings: Pick<ElectronSafeSettings, 'shortcuts' | 'keyboardNavigation'> | null = null;

const homeOverride = app.commandLine.getSwitchValue('hackdesk-home');
if (homeOverride) {
  app.setPath('home', homeOverride);
}
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
    if (!startupComplete) return;
    writeLog('main', 'second instance requested focus');
    windowManager.showAndFocusMainWindow();
  });
}

/**
 * Rebuilds every native menu from the latest settings and window list. macOS draws one global
 * menu bar, so it shows the focused window checked; Linux and Windows draw the bar inside each
 * window, so each window gets its own copy with itself checked.
 */
function rebuildMenus() {
  if (!latestMenuSettings) return;
  const settings = latestMenuSettings;
  const baseOptions = {
    sendCommand: (command, sourceWindow?: BrowserWindow | null) => (
      windowManager.sendCommandToWindow(command, sourceWindow)
    ),
    shortcuts: settings.shortcuts ?? {},
    closeWindow: (target?: BrowserWindow | null) => windowManager.closeMainWindow(target ?? undefined),
    newWindow: () => windowManager.newMainWindow(),
    focusWindow: (target: BrowserWindow) => windowManager.focusMainWindow(target),
    characterShortcutsEnabled: settings.keyboardNavigation?.characterShortcutsEnabled ?? true,
  } satisfies Partial<ApplicationMenuOptions>;

  if (process.platform === 'darwin') {
    const windows = windowManager.getMainWindows().map((window) => ({
      window,
      title: window.getTitle(),
      focused: window.isFocused(),
    }));
    createApplicationMenu({ ...baseOptions, windows });
    return;
  }

  // Windows without a menu of their own (Quick Hack, presentation) use the application menu.
  // Without one, Electron's default menu, with Reload and DevTools, would appear there instead.
  createApplicationMenu({
    ...baseOptions,
    windows: windowManager.getMainWindows().map((window) => ({ window, title: window.getTitle(), focused: false })),
  });
  for (const window of windowManager.getMainWindows()) {
    if (window.isDestroyed()) continue;
    const windows = windowManager.getMainWindows().map((candidate) => ({
      window: candidate,
      title: candidate.getTitle(),
      focused: candidate === window,
    }));
    attachWindowMenu(window, { ...baseOptions, windows });
  }
}

function openWorkspaceWindow(workspace: WindowWorkspaceScope) {
  windowManager.newMainWindow({ workspace });
}

function refreshMenus(settings: Pick<ElectronSafeSettings, 'shortcuts' | 'keyboardNavigation'>) {
  latestMenuSettings = settings;
  rebuildMenus();
}

app.whenReady().then(async () => {
  registerRendererProtocol();
  disposeIpcHandlers = registerIpcHandlers(windowManager, {
    onSettingsUpdated: (settings) => {
      refreshMenus(settings);
      if (settings.appIcon) setAppIcon(settings.appIcon);
      updateDockMenu(settings, openWorkspaceWindow);
    },
  }).dispose;
  windowManager.onMenuStateChanged(rebuildMenus);
  if (!await ensureReadableSettings()) {
    writeLog('main', 'quit from settings recovery; settings file left unchanged');
    app.quit();
    return;
  }
  const storedSettings = await readStoredSettings();
  setAppIcon(storedSettings.appIcon);
  refreshMenus(storedSettings);
  updateDockMenu(storedSettings, openWorkspaceWindow);
  windowManager.createMainWindow();
  startupComplete = true;
  if (app.commandLine.hasSwitch('quick-capture')) {
    windowManager.showQuickCaptureWindow();
  }
  registerQuickCaptureGlobalShortcut(windowManager);
  tray = createApplicationTray({
    showMainWindow: () => windowManager.showAndFocusMainWindow(),
    showQuickCaptureWindow: () => windowManager.showQuickCaptureWindow(),
  });

  app.on('activate', () => {
    windowManager.handleAppActivation();
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

app.on('before-quit', (event) => {
  windowManager.handleBeforeQuit(event);
});

app.on('will-quit', () => {
  disposeIpcHandlers?.();
  disposeIpcHandlers = null;
  unregisterQuickCaptureGlobalShortcut();
});

export function getTrayForTesting() {
  return tray;
}
