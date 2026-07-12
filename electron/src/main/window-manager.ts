import { app, BrowserWindow, dialog, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type {
  HackDeskCommandPaletteCommand,
  QuickCaptureSubmissionAck,
  QuickCaptureSubmitResult,
} from '../../../src/lib/electron-api';
import { getRendererEntryUrl, getRendererRouteUrl } from './paths';
import { openExternalUrl } from './url-policy';
import { getAppIconPath } from './app-icon';
import { ELECTRON_CHANNELS } from '../shared/channels';
import { exportDebugLogs, writeLog } from './logging';
import { isTrustedRendererUrl } from './renderer-url';
import { createUnresponsiveSampler } from './unresponsive-sampler';
import { persistWindowState, readWindowState } from './window-state';

const WINDOW_BACKGROUND_COLOR = process.platform === 'darwin' ? '#00000000' : '#fdfdfd';
const DEFAULT_WINDOW_SIZE = { width: 1180, height: 760 };
const QUICK_CAPTURE_SIZE = { width: 420, height: 260 };
const QUICK_CAPTURE_PRESENTATION_TIMEOUT_MS = 1000;
const QUICK_CAPTURE_SUBMISSION_TIMEOUT_MS = 15_000;

type PendingQuickCaptureSubmission = {
  resolve: (result: QuickCaptureSubmitResult) => void;
  timeout: NodeJS.Timeout;
};

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private quickCaptureWindow: BrowserWindow | null = null;
  private recoveryDialogShowing = false;
  private isAppQuitting = false;
  private keyboardCloseIntent = false;
  private keyboardCloseIntentTimeout: NodeJS.Timeout | null = null;
  private pendingCloseTimeout: NodeJS.Timeout | null = null;
  private pendingMainWindowCommands: HackDeskCommandPaletteCommand[] = [];
  private pendingQuickCaptureSubmissions = new Map<string, PendingQuickCaptureSubmission>();
  private quickCaptureOpenedFromMain = false;
  private quickCapturePresentationInProgress = false;
  private quickCapturePresentationTimeout: NodeJS.Timeout | null = null;

  getMainWindow() {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null;
  }

  getTargetWindow() {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? this.getMainWindow();
    return focusedWindow && !focusedWindow.isDestroyed() ? focusedWindow : null;
  }

  getQuickCaptureWindow() {
    return this.quickCaptureWindow && !this.quickCaptureWindow.isDestroyed() ? this.quickCaptureWindow : null;
  }

  isQuickCaptureActive() {
    const window = this.getQuickCaptureWindow();
    return this.quickCapturePresentationInProgress
      || Boolean(window?.isVisible() || window?.isFocused());
  }

  handleAppActivation() {
    if (this.isQuickCaptureActive()) {
      return;
    }

    if (!this.getMainWindow()) {
      this.createMainWindow();
      return;
    }

    this.showAndFocusMainWindow();
  }

  sendCommand(command: HackDeskCommandPaletteCommand) {
    this.getTargetWindow()?.webContents.send(ELECTRON_CHANNELS.appCommand, command);
  }

  sendCommandToMainWindow(command: HackDeskCommandPaletteCommand, options: { focus?: boolean } = {}) {
    const focus = options.focus ?? true;
    const window = this.getMainWindow() ?? this.createMainWindow({ showOnReady: focus });
    if (focus) {
      this.showAndFocusMainWindow();
    }

    if (window.webContents.isLoading()) {
      this.pendingMainWindowCommands.push(command);
      return;
    }

    if (this.canDispatchMainWindowCommand(command)) {
      window.webContents.send(ELECTRON_CHANNELS.appCommand, command);
    }
  }

  setAppQuitting(isAppQuitting: boolean) {
    this.isAppQuitting = isAppQuitting;
  }

  setThemeSurface(background: string) {
    const window = this.getMainWindow();
    if (!window) {
      return;
    }

    window.setBackgroundColor(background);
  }

  setMenuShortcutsIgnored(ignore: boolean) {
    this.getTargetWindow()?.webContents.setIgnoreMenuShortcuts(ignore);
  }

  confirmClose() {
    const window = this.getMainWindow();
    this.clearPendingCloseTimeout();
    if (!window) {
      return;
    }

    writeLog('main', 'renderer confirmed window close');
    window.destroy();
  }

  cancelClose() {
    this.clearPendingCloseTimeout();
    writeLog('main', 'renderer cancelled window close');
  }

  showAndFocusMainWindow() {
    const window = this.getMainWindow();

    if (!window) {
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
  }

  showQuickCaptureWindow() {
    const existingWindow = this.getQuickCaptureWindow();
    if (existingWindow?.isFocused()) {
      existingWindow.show();
      existingWindow.focus();
      return existingWindow;
    }

    const mainWindow = this.getMainWindow();
    this.quickCaptureOpenedFromMain = mainWindow?.isFocused() ?? false;
    this.beginQuickCapturePresentation();
    if (process.platform === 'darwin') {
      if (!this.quickCaptureOpenedFromMain) {
        mainWindow?.hide();
      }
      app.show();
      if (!this.quickCaptureOpenedFromMain) {
        mainWindow?.hide();
      }
    }

    if (existingWindow) {
      existingWindow.show();
      existingWindow.focus();
      return existingWindow;
    }

    const isMac = process.platform === 'darwin';
    const workArea = this.getQuickCaptureWorkArea();
    const bounds = {
      width: QUICK_CAPTURE_SIZE.width,
      height: QUICK_CAPTURE_SIZE.height,
      x: workArea.x + Math.round((workArea.width - QUICK_CAPTURE_SIZE.width) / 2),
      y: workArea.y + Math.max(48, Math.round(workArea.height * 0.18)),
    };

    const window = new BrowserWindow({
      ...bounds,
      minWidth: 360,
      minHeight: 220,
      show: false,
      title: 'Quick Capture',
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
      alwaysOnTop: true,
      backgroundColor: WINDOW_BACKGROUND_COLOR,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      resizable: false,
      icon: getAppIconPath(),
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      },
    });
    this.quickCaptureWindow = window;
    this.configureSessionPolicy(window);

    window.once('ready-to-show', () => {
      window.show();
      window.focus();
    });
    window.on('focus', () => {
      this.completeQuickCapturePresentation();
    });
    window.on('close', (event) => {
      if (this.isAppQuitting) {
        return;
      }

      event.preventDefault();
      this.hideQuickCaptureWindow();
    });
    window.on('closed', () => {
      this.completeQuickCapturePresentation();
      if (this.quickCaptureWindow === window) {
        this.quickCaptureWindow = null;
      }
      this.resolveAllQuickCaptureSubmissions({
        accepted: false,
        error: 'Quick Capture closed before HackDesk could create the draft. Your text is still saved.',
      });
    });

    void window.loadURL(getRendererRouteUrl('/quick-capture'));
    return window;
  }

  hideQuickCaptureWindow() {
    this.completeQuickCapturePresentation();
    this.getQuickCaptureWindow()?.hide();

    if (process.platform !== 'darwin') {
      return;
    }

    if (this.quickCaptureOpenedFromMain) {
      this.showAndFocusMainWindow();
      return;
    }

    app.hide();
  }

  submitQuickCapture(content: string): Promise<QuickCaptureSubmitResult> {
    if (!content.trim()) {
      return Promise.resolve({ accepted: false, error: 'Write something before capturing.' });
    }

    const requestId = randomUUID();
    const expiresAt = Date.now() + QUICK_CAPTURE_SUBMISSION_TIMEOUT_MS;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!this.pendingQuickCaptureSubmissions.delete(requestId)) {
          return;
        }

        resolve({
          accepted: false,
          error: 'Quick Capture did not reach HackDesk. Your text is still here.',
        });
        this.showQuickCaptureWindow();
      }, QUICK_CAPTURE_SUBMISSION_TIMEOUT_MS);

      this.pendingQuickCaptureSubmissions.set(requestId, { resolve, timeout });
      this.sendCommandToMainWindow({
        type: 'quick-capture:create-draft',
        content,
        requestId,
        expiresAt,
      }, { focus: false });
    });
  }

  resolveQuickCaptureSubmission(ack: QuickCaptureSubmissionAck) {
    const pending = this.pendingQuickCaptureSubmissions.get(ack.requestId);
    if (!pending) {
      writeLog('main', 'received unknown quick capture submission acknowledgement', {
        requestId: ack.requestId,
      }, 'warn');
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingQuickCaptureSubmissions.delete(ack.requestId);

    if (!ack.accepted) {
      pending.resolve({ accepted: false, error: ack.error });
      this.showQuickCaptureWindow();
      return;
    }

    this.completeQuickCapturePresentation();
    this.getQuickCaptureWindow()?.hide();
    this.showAndFocusMainWindow();
    pending.resolve({ accepted: true });
  }

  createMainWindow(options: { showOnReady?: boolean } = {}) {
    const showOnReady = options.showOnReady ?? true;
    const isMac = process.platform === 'darwin';
    const rendererUrl = getRendererEntryUrl();
    const workArea = screen.getPrimaryDisplay().workArea;
    const fallbackBounds = {
      width: DEFAULT_WINDOW_SIZE.width,
      height: DEFAULT_WINDOW_SIZE.height,
      x: workArea.x + Math.round((workArea.width - DEFAULT_WINDOW_SIZE.width) / 2),
      y: workArea.y + Math.round((workArea.height - DEFAULT_WINDOW_SIZE.height) / 2),
    };
    const windowState = readWindowState(fallbackBounds);

    this.mainWindow = new BrowserWindow({
      ...windowState.bounds,
      minWidth: 900,
      minHeight: 620,
      show: false,
      title: 'HackDesk',
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      trafficLightPosition: isMac ? { x: 16, y: 12 } : undefined,
      backgroundColor: WINDOW_BACKGROUND_COLOR,
      vibrancy: isMac ? 'sidebar' : undefined,
      visualEffectState: isMac ? 'active' : undefined,
      icon: getAppIconPath(),
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      },
    });
    persistWindowState(this.mainWindow);
    const unresponsiveSampler = createUnresponsiveSampler(this.mainWindow, 'main');

    if (windowState.isMaximized) {
      this.mainWindow.maximize();
    }

    this.mainWindow.once('ready-to-show', () => {
      if (showOnReady) {
        this.mainWindow?.show();
      }
    });

    this.mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (!input || input.type !== 'keyDown') {
        return;
      }

      const isCloseShortcut = input.key?.toLowerCase() === 'w' && (
        process.platform === 'darwin' ? input.meta : input.control
      );
      if (!isCloseShortcut) {
        return;
      }

      this.keyboardCloseIntent = true;
      if (this.keyboardCloseIntentTimeout) {
        clearTimeout(this.keyboardCloseIntentTimeout);
      }

      this.keyboardCloseIntentTimeout = setTimeout(() => {
        this.keyboardCloseIntent = false;
        this.keyboardCloseIntentTimeout = null;
      }, 500);
    });

    this.mainWindow.on('close', (event) => {
      this.handleCloseRequest(event);
    });

    this.mainWindow.on('closed', () => {
      this.clearKeyboardCloseIntent();
      this.clearPendingCloseTimeout();
      this.mainWindow = null;
    });

    this.configureSessionPolicy(this.mainWindow);

    this.mainWindow.webContents.on('context-menu', (event, params) => {
      if (params.isEditable || params.selectionText.trim()) {
        return;
      }

      event.preventDefault();
    });

    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void openExternalUrl(url).catch((error) => {
        writeLog('navigation', 'failed to open external URL', {
          url,
          error: error instanceof Error ? error.message : String(error),
        }, 'warn');
      });

      return { action: 'deny' };
    });

    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url === this.mainWindow?.webContents.getURL() || isTrustedRendererUrl(url)) {
        return;
      }

      event.preventDefault();
      void openExternalUrl(url).catch((error) => {
        writeLog('navigation', 'failed to open external navigation', {
          url,
          error: error instanceof Error ? error.message : String(error),
        }, 'warn');
      });
    });
    this.mainWindow.webContents.on('did-finish-load', () => {
      this.flushPendingMainWindowCommands();
    });

    this.mainWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        this.handleRendererLoadFailure(errorCode, errorDescription, validatedUrl, isMainFrame);
      },
    );
    this.mainWindow.webContents.on(
      'did-fail-provisional-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        this.handleRendererLoadFailure(errorCode, errorDescription, validatedUrl, isMainFrame);
      },
    );
    this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
      unresponsiveSampler.stopAndFlush();
      writeLog('renderer', 'render process gone', details, 'error');
      this.showRecoveryDialog(
        'HackDesk renderer stopped',
        `Reason: ${details.reason}. Exit code: ${details.exitCode}.`,
      );
    });
    this.mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
      writeLog('renderer', 'preload script failed', {
        preloadPath,
        error: error.message,
        stack: error.stack,
      }, 'error');
      this.showRecoveryDialog('HackDesk preload failed', error.message);
    });
    this.mainWindow.on('unresponsive', () => {
      writeLog('renderer', 'main window became unresponsive', undefined, 'warn');
      unresponsiveSampler.start();
      this.showRecoveryDialog('HackDesk is not responding', 'You can wait, reload the app window, or export debug logs.', true);
    });
    this.mainWindow.on('responsive', () => {
      unresponsiveSampler.stopAndFlush();
      writeLog('renderer', 'main window became responsive');
    });

    void this.mainWindow.loadURL(rendererUrl);
    return this.mainWindow;
  }

  private flushPendingMainWindowCommands() {
    const window = this.getMainWindow();
    if (!window || this.pendingMainWindowCommands.length === 0) {
      return;
    }

    const commands = this.pendingMainWindowCommands;
    this.pendingMainWindowCommands = [];
    for (const command of commands) {
      if (this.canDispatchMainWindowCommand(command)) {
        window.webContents.send(ELECTRON_CHANNELS.appCommand, command);
      }
    }
  }

  private canDispatchMainWindowCommand(command: HackDeskCommandPaletteCommand) {
    if (command.type !== 'quick-capture:create-draft') {
      return true;
    }

    return command.expiresAt > Date.now()
      && this.pendingQuickCaptureSubmissions.has(command.requestId);
  }

  private beginQuickCapturePresentation() {
    this.completeQuickCapturePresentation();
    this.quickCapturePresentationInProgress = true;
    this.quickCapturePresentationTimeout = setTimeout(() => {
      this.quickCapturePresentationInProgress = false;
      this.quickCapturePresentationTimeout = null;
    }, QUICK_CAPTURE_PRESENTATION_TIMEOUT_MS);
  }

  private completeQuickCapturePresentation() {
    this.quickCapturePresentationInProgress = false;
    if (this.quickCapturePresentationTimeout) {
      clearTimeout(this.quickCapturePresentationTimeout);
      this.quickCapturePresentationTimeout = null;
    }
  }

  private getQuickCaptureWorkArea() {
    try {
      return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    } catch {
      return screen.getPrimaryDisplay().workArea;
    }
  }

  private resolveAllQuickCaptureSubmissions(result: QuickCaptureSubmitResult) {
    for (const [requestId, pending] of this.pendingQuickCaptureSubmissions) {
      clearTimeout(pending.timeout);
      pending.resolve(result);
      this.pendingQuickCaptureSubmissions.delete(requestId);
    }
  }

  private configureSessionPolicy(window: BrowserWindow) {
    const { session } = window.webContents;

    session.setPermissionRequestHandler((webContents, permission, callback, details) => {
      writeLog('security', 'permission request denied', {
        permission,
        requestingUrl: details.requestingUrl,
        currentUrl: webContents.getURL(),
      }, 'warn');
      callback(false);
    });

    session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      writeLog('security', 'permission check denied', {
        permission,
        requestingOrigin,
        currentUrl: webContents?.getURL(),
      }, 'warn');
      return false;
    });
  }

  private handleCloseRequest(event: Electron.Event) {
    const window = this.getMainWindow();
    if (!window || this.isAppQuitting) {
      return;
    }

    if (window.webContents.isDestroyed() || !window.webContents.mainFrame) {
      return;
    }

    event.preventDefault();
    const source = this.keyboardCloseIntent ? 'keyboard-shortcut' : 'window-button';
    this.clearKeyboardCloseIntent();
    writeLog('main', 'window close requested', { source });
    window.webContents.send(ELECTRON_CHANNELS.appCloseRequested, { source });
    this.startPendingCloseTimeout();
  }

  private startPendingCloseTimeout() {
    this.clearPendingCloseTimeout();
    this.pendingCloseTimeout = setTimeout(() => {
      this.pendingCloseTimeout = null;
      const window = this.getMainWindow();
      if (!window) {
        return;
      }

      writeLog('main', 'renderer did not respond to close request; forcing window close', undefined, 'warn');
      window.destroy();
    }, 3000);
  }

  private clearKeyboardCloseIntent() {
    this.keyboardCloseIntent = false;
    if (this.keyboardCloseIntentTimeout) {
      clearTimeout(this.keyboardCloseIntentTimeout);
      this.keyboardCloseIntentTimeout = null;
    }
  }

  private clearPendingCloseTimeout() {
    if (this.pendingCloseTimeout) {
      clearTimeout(this.pendingCloseTimeout);
      this.pendingCloseTimeout = null;
    }
  }

  private handleRendererLoadFailure(
    errorCode: number,
    errorDescription: string,
    validatedUrl: string,
    isMainFrame?: boolean,
  ) {
    if (errorCode === -3 || isMainFrame === false || !isTrustedRendererUrl(validatedUrl)) {
      return;
    }

    writeLog('renderer', 'renderer failed to load', {
      errorCode,
      errorDescription,
      validatedUrl,
    }, 'error');
    this.showRecoveryDialog('HackDesk failed to load', errorDescription);
  }

  private showRecoveryDialog(message: string, detail: string, canKeepWaiting = false) {
    const targetWindow = this.getTargetWindow();
    if (!targetWindow || this.recoveryDialogShowing) {
      return;
    }

    this.recoveryDialogShowing = true;
    const buttons = canKeepWaiting
      ? ['Reload', 'Export Logs', 'Relaunch', 'Keep Waiting']
      : ['Reload', 'Export Logs', 'Relaunch', 'Quit'];

    void dialog.showMessageBox(targetWindow, {
      type: 'warning',
      title: app.getName(),
      message,
      detail,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      noLink: true,
    }).then(async (result) => {
      switch (buttons[result.response]) {
      case 'Reload':
        await targetWindow.loadURL(getRendererEntryUrl());
        break;
      case 'Export Logs':
        await exportDebugLogs();
        break;
      case 'Relaunch':
        app.relaunch();
        app.exit(0);
        break;
      case 'Quit':
        app.quit();
        break;
      }
    }).finally(() => {
      this.recoveryDialogShowing = false;
    });
  }
}
