import { app, BrowserWindow, dialog, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type {
  HackDeskCommandPaletteCommand,
  NewWindowInput,
  PresentationDeck,
  QuickCaptureSubmissionAck,
  QuickCaptureSubmitResult,
} from '../../../src/lib/electron-api';
import { appendWindowWorkspaceToUrl } from '../../../src/lib/window-workspace';
import { getRendererEntryUrl, getRendererRouteUrl } from './paths';
import { openExternalUrl } from './url-policy';
import { getAppIconPath } from './app-icon';
import { isE2EBackgroundRun } from './e2e-background-windows';
import { ELECTRON_CHANNELS } from '../shared/channels';
import { exportDebugLogs, writeLog } from './logging';
import { isTrustedRendererUrl } from './renderer-url';

/**
 * The one permission the app's own renderer gets: reading installed font names for the Appearance
 * font picker. Every other permission, and every other origin, stays denied.
 */
export function isGrantedRendererPermission(permission: string, url: string | undefined) {
  return permission === 'local-fonts' && Boolean(url) && isTrustedRendererUrl(url!);
}
import { createUnresponsiveSampler } from './unresponsive-sampler';
import { persistWindowState, readWindowState } from './window-state';

const PRESENTATION_BACKGROUND_COLOR = '#191919';
const WINDOW_BACKGROUND_COLOR = process.platform === 'darwin' ? '#00000000' : '#fdfdfd';
const DEFAULT_WINDOW_SIZE = { width: 1180, height: 760 };
const QUICK_CAPTURE_SIZE = { width: 480, height: 320 };
const QUICK_CAPTURE_PRESENTATION_TIMEOUT_MS = 1000;
const QUICK_CAPTURE_SUBMISSION_TIMEOUT_MS = 15_000;

// Channels only the Quick Hack and presentation windows may call; the main window may call the rest.
const QUICK_CAPTURE_CHANNELS = new Set<string>([ELECTRON_CHANNELS.appSubmitQuickCapture, ELECTRON_CHANNELS.appHideQuickCapture]);
const PRESENTATION_CHANNELS = new Set<string>([
  ELECTRON_CHANNELS.appGetPresentation,
  ELECTRON_CHANNELS.appClosePresentation,
  ELECTRON_CHANNELS.appTogglePresentationFullScreen,
]);

type PendingQuickCaptureSubmission = {
  resolve: (result: QuickCaptureSubmitResult) => void;
  timeout: NodeJS.Timeout;
};

export class WindowManager {
  private mainWindows = new Set<BrowserWindow>();
  private mainWindowFocusOrder: BrowserWindow[] = [];
  private pendingCloseByWindow = new Map<BrowserWindow, {
    source: import('../../../src/lib/electron-api').HackDeskCloseRequestSource;
    timeout: NodeJS.Timeout | null;
  }>();
  private quickCaptureWindow: BrowserWindow | null = null;
  private presentationWindow: BrowserWindow | null = null;
  private presentationDeck: PresentationDeck | null = null;
  private presentationFullScreen = false;
  private recoveryDialogs = new Set<BrowserWindow>();
  private allowAppQuit = false;
  private activationMode: 'regular' | 'accessory' = 'regular';
  private pendingMainWindowCommands: HackDeskCommandPaletteCommand[] = [];
  private pendingQuickCaptureSubmissions = new Map<string, PendingQuickCaptureSubmission>();
  private quickCaptureOpenedFromMain = false;
  private quickCapturePresentationInProgress = false;
  private quickCapturePresentationTimeout: NodeJS.Timeout | null = null;

  getMainWindow() {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && !focused.isDestroyed() && this.mainWindows.has(focused)) {
      return focused;
    }
    for (let index = this.mainWindowFocusOrder.length - 1; index >= 0; index -= 1) {
      const window = this.mainWindowFocusOrder[index];
      if (window && !window.isDestroyed() && this.mainWindows.has(window)) {
        return window;
      }
    }
    return null;
  }

  getMainWindows() {
    const windows: BrowserWindow[] = [];
    for (const window of this.mainWindows) {
      if (!window.isDestroyed()) {
        windows.push(window);
      }
    }
    return windows;
  }

  private menuStateListeners = new Set<() => void>();

  /** Rebuild native menus when windows open, close, focus or retitle. */
  onMenuStateChanged(listener: () => void) {
    this.menuStateListeners.add(listener);
    return () => {
      this.menuStateListeners.delete(listener);
    };
  }

  private emitMenuStateChanged() {
    for (const listener of this.menuStateListeners) {
      listener();
    }
  }

  getMainWindowForWebContents(webContents: Electron.WebContents) {
    for (const window of this.mainWindows) {
      if (!window.isDestroyed() && window.webContents === webContents) {
        return window;
      }
    }
    return null;
  }

  sendToAllMainWindows(channel: string, payload: unknown) {
    for (const window of this.getMainWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(channel, payload);
      }
    }
  }

  getTargetWindow() {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? this.getMainWindow();
    return focusedWindow && !focusedWindow.isDestroyed() ? focusedWindow : null;
  }

  getPresentationWindow() {
    return this.presentationWindow && !this.presentationWindow.isDestroyed() ? this.presentationWindow : null;
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

    this.showAndFocusMainWindow();
  }

  closeMainWindow(target?: BrowserWindow | null) {
    (target ?? this.getMainWindow())?.close();
  }

  /** Opens a fresh main window next to the focused one. Every window runs the same app. */
  newMainWindow(input: NewWindowInput = {}) {
    const entryUrl = getRendererEntryUrl();
    const window = this.createMainWindow({
      showOnReady: false,
      initialUrl: input.workspace ? appendWindowWorkspaceToUrl(entryUrl, input.workspace) : entryUrl,
    });
    window.once('ready-to-show', () => {
      if (window.isDestroyed()) return;
      window.show();
      window.focus();
    });
    return window;
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

    this.dispatchCommandToWindow(window, command);
  }

  /** Sends a menu command to the window whose menu was clicked, falling back to the focused one. */
  sendCommandToWindow(command: HackDeskCommandPaletteCommand, sourceWindow?: BrowserWindow | null) {
    const window = sourceWindow && !sourceWindow.isDestroyed() && this.mainWindows.has(sourceWindow)
      ? sourceWindow
      : this.getMainWindow() ?? this.createMainWindow({ showOnReady: true });

    this.dispatchCommandToWindow(window, command);
  }

  private dispatchCommandToWindow(window: BrowserWindow, command: HackDeskCommandPaletteCommand) {
    if (window.webContents.isLoading()) {
      this.pendingMainWindowCommands.push(command);
      return;
    }

    if (this.canDispatchMainWindowCommand(command)) {
      window.webContents.send(ELECTRON_CHANNELS.appCommand, command);
    }
  }

  focusMainWindow(target: BrowserWindow) {
    if (target.isDestroyed() || !this.mainWindows.has(target)) {
      return;
    }

    if (target.isMinimized()) {
      target.restore();
    }

    target.show();
    target.focus();
  }

  setThemeSurface(background: string) {
    const windows = this.getMainWindows();
    if (windows.length === 0) {
      return;
    }

    for (const window of windows) {
      window.setBackgroundColor(background);
    }
  }

  setMenuShortcutsIgnored(ignore: boolean) {
    this.getTargetWindow()?.webContents.setIgnoreMenuShortcuts(ignore);
  }

  getWindowPresentationState() {
    return { fullScreen: this.getMainWindow()?.isFullScreen() ?? false };
  }

  getWindowPresentationStateForSender(sender: Electron.WebContents) {
    return { fullScreen: this.getMainWindowForWebContents(sender)?.isFullScreen() ?? false };
  }

  confirmCloseForSender(sender: Electron.WebContents) {
    this.confirmClose(this.getMainWindowForWebContents(sender));
  }

  cancelCloseForSender(sender: Electron.WebContents) {
    this.cancelClose(this.getMainWindowForWebContents(sender));
  }

  holdCloseForSender(sender: Electron.WebContents) {
    this.holdClose(this.getMainWindowForWebContents(sender));
  }

  confirmClose(target?: BrowserWindow | null) {
    const window = target ?? this.getMainWindow();
    if (!window) {
      return;
    }
    const pending = this.pendingCloseByWindow.get(window);
    this.clearPendingCloseTimeout(window);
    if (!pending) {
      return;
    }

    const source = pending.source;
    writeLog('main', 'renderer confirmed close', { source });
    if (source === 'app-quit') {
      this.pendingCloseByWindow.delete(window);
      this.allowAppQuit = true;
      app.quit();
    } else {
      this.pendingCloseByWindow.delete(window);
      window.destroy();
    }
  }

  /**
   * The window has the close request and is asking the user about unsaved changes. The timeout
   * guards against a window that never answers, not a person reading the question, so it stops.
   */
  holdClose(target?: BrowserWindow | null) {
    const window = target ?? this.getMainWindow();
    if (!window || !this.pendingCloseByWindow.has(window)) return;
    this.clearPendingCloseTimeout(window);
    writeLog('main', 'renderer is confirming close with the user');
  }

  cancelClose(target?: BrowserWindow | null) {
    const window = target ?? this.getMainWindow();
    if (!window) return;
    this.clearPendingCloseTimeout(window);
    writeLog('main', 'renderer cancelled window close');
    this.pendingCloseByWindow.delete(window);
  }

  handleBeforeQuit(event: Electron.Event) {
    if (this.allowAppQuit) {
      return;
    }

    const windows = this.getMainWindows();
    if (windows.length === 0) {
      this.allowAppQuit = true;
      return;
    }

    event.preventDefault();
    for (const window of windows) {
      this.sendCloseRequest(window, 'app-quit');
    }
  }

  isTrustedIpcSender(event: Electron.IpcMainInvokeEvent, channel: string) {
    if (event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame.url)) {
      return false;
    }
    if (event.sender === this.getQuickCaptureWindow()?.webContents) {
      return QUICK_CAPTURE_CHANNELS.has(channel);
    }
    if (event.sender === this.getPresentationWindow()?.webContents) {
      return PRESENTATION_CHANNELS.has(channel);
    }
    return this.getMainWindowForWebContents(event.sender) !== null
      && !QUICK_CAPTURE_CHANNELS.has(channel)
      && !PRESENTATION_CHANNELS.has(channel);
  }

  showAndFocusMainWindow() {
    this.setActivationMode('regular');
    const existingWindow = this.getMainWindow();
    if (!existingWindow) {
      const window = this.createMainWindow({ showOnReady: false });
      window.once('ready-to-show', () => {
        if (window.isDestroyed()) return;
        window.show();
        window.focus();
      });
      return;
    }

    const window = existingWindow;

    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
  }

  private setActivationMode(mode: 'regular' | 'accessory') {
    if (process.platform !== 'darwin' || this.activationMode === mode || this.allowAppQuit) {
      return;
    }

    app.setActivationPolicy(mode);
    this.activationMode = mode;
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
      title: 'Quick Hack',
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
        preload: join(__dirname, 'quick-capture-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      },
    });
    this.quickCaptureWindow = window;
    this.configureWindowPolicy(window);
    const rendererUrl = getRendererRouteUrl('/quick-capture');
    this.configureWindowRecovery(window, rendererUrl, 'Quick Hack');

    window.once('ready-to-show', () => {
      if (window.isDestroyed()) return;
      window.show();
      window.focus();
    });
    window.on('focus', () => {
      this.completeQuickCapturePresentation();
    });
    window.webContents.on('before-input-event', (event, input) => {
      if (process.platform === 'darwin' && input.type === 'keyDown'
        && input.key?.toLowerCase() === 'q' && input.meta
        && !input.alt && !input.control && !input.shift) {
        event.preventDefault();
        app.quit();
      }
    });
    window.on('close', (event) => {
      if (this.allowAppQuit) {
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
        error: 'Quick Hack closed before HackDesk could create the draft. Your text is still saved.',
      });
    });

    void window.loadURL(rendererUrl).catch(error => writeLog('renderer', 'Quick Hack load failed', error, 'error'));
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
          error: 'Quick Hack did not reach HackDesk. Your text is still here.',
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

    this.getMainWindow()?.webContents.session.flushStorageData();
    this.hideQuickCaptureWindow();
    pending.resolve({ accepted: true });
  }

  /**
   * Presents a note in a window over the main one, the same size and place, so the slides fill the
   * app's window without taking over the screen. Full screen is the slides' own button (or F).
   * Presenting again shows the new deck.
   */
  showPresentationWindow(deck: PresentationDeck) {
    this.presentationDeck = deck;
    const existingWindow = this.getPresentationWindow();
    if (existingWindow) {
      existingWindow.webContents.reload();
      existingWindow.focus();
      return existingWindow;
    }

    const mainWindow = this.getMainWindow();
    // A main window in full screen has no place to cover; the presentation fills its display's work area instead.
    const bounds = mainWindow && !mainWindow.isFullScreen() && !mainWindow.isMinimized()
      ? mainWindow.getBounds()
      : (mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay()).workArea;
    const window = new BrowserWindow({
      ...bounds,
      show: false,
      title: deck.title || 'Presentation',
      backgroundColor: PRESENTATION_BACKGROUND_COLOR,
      icon: getAppIconPath(),
      webPreferences: {
        preload: join(__dirname, 'presentation-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      },
    });
    this.presentationWindow = window;
    this.presentationFullScreen = false;
    this.configureWindowPolicy(window);
    const rendererUrl = getRendererRouteUrl('/present');
    this.configureWindowRecovery(window, rendererUrl, 'Presentation');

    const reportFullScreen = (fullScreen: boolean) => {
      if (this.presentationWindow !== window || window.isDestroyed()) return;
      this.presentationFullScreen = fullScreen;
      window.webContents.send(ELECTRON_CHANNELS.appPresentationFullScreenChanged, { fullScreen });
    };
    window.on('enter-full-screen', () => reportFullScreen(true));
    window.on('leave-full-screen', () => reportFullScreen(false));
    window.once('ready-to-show', () => {
      if (window.isDestroyed()) return;
      window.show();
      window.focus();
    });
    window.on('closed', () => {
      if (this.presentationWindow !== window) return;
      this.presentationWindow = null;
      this.presentationDeck = null;
      this.getMainWindow()?.focus();
    });

    void window.loadURL(rendererUrl).catch(error => writeLog('renderer', 'Presentation load failed', error, 'error'));
    return window;
  }

  /** Puts the slides in or out of full screen; returns whether they are now full screen. */
  togglePresentationFullScreen() {
    const window = this.getPresentationWindow();
    if (!window) return false;
    const next = !this.presentationFullScreen;
    if (isE2EBackgroundRun()) {
      // Full screen opens a Space of its own and takes over the screen; background e2e runs only
      // report the change, so the slides' button and keys can still be checked.
      this.presentationFullScreen = next;
      window.webContents.send(ELECTRON_CHANNELS.appPresentationFullScreenChanged, { fullScreen: next });
      return next;
    }
    window.setFullScreen(next);
    return next;
  }

  getPresentationDeck() {
    return this.presentationDeck;
  }

  closePresentationWindow() {
    this.getPresentationWindow()?.close();
  }

  createMainWindow(options: { showOnReady?: boolean; initialUrl?: string } = {}) {
    const showOnReady = options.showOnReady ?? true;
    const isMac = process.platform === 'darwin';
    const rendererUrl = options.initialUrl ?? getRendererEntryUrl();
    const workArea = screen.getPrimaryDisplay().workArea;
    const centeredFallback = {
      width: DEFAULT_WINDOW_SIZE.width,
      height: DEFAULT_WINDOW_SIZE.height,
      x: workArea.x + Math.round((workArea.width - DEFAULT_WINDOW_SIZE.width) / 2),
      y: workArea.y + Math.round((workArea.height - DEFAULT_WINDOW_SIZE.height) / 2),
    };
    // Later windows cascade off the focused one; the first one restores the saved bounds.
    const anchor = this.getMainWindow();
    const fallbackBounds = anchor && !anchor.isDestroyed()
      ? {
        width: centeredFallback.width,
        height: centeredFallback.height,
        x: anchor.getBounds().x + 32,
        y: anchor.getBounds().y + 32,
      }
      : centeredFallback;
    const windowState = readWindowState(fallbackBounds);

    const window = new BrowserWindow({
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
    this.mainWindows.add(window);
    this.trackMainWindowFocus(window);
    this.emitMenuStateChanged();
    persistWindowState(window);
    const unresponsiveSampler = createUnresponsiveSampler(window, 'main');

    if (windowState.isMaximized) {
      window.maximize();
    }

    window.once('ready-to-show', () => {
      if (showOnReady && !window.isDestroyed()) {
        window.show();
      }
    });

    window.on('close', (event) => {
      this.handleCloseRequest(event, window);
    });

    window.on('enter-full-screen', () => {
      this.sendWindowPresentationState(window, true);
    });

    window.on('leave-full-screen', () => {
      this.sendWindowPresentationState(window, false);
    });

    window.on('focus', () => {
      this.trackMainWindowFocus(window);
    });

    window.on('page-title-updated', () => {
      this.emitMenuStateChanged();
    });

    window.on('closed', () => {
      this.mainWindows.delete(window);
      this.mainWindowFocusOrder = this.mainWindowFocusOrder.filter((candidate) => candidate !== window);
      this.clearPendingCloseTimeout(window);
      this.pendingCloseByWindow.delete(window);
      this.quickCaptureOpenedFromMain = false;
      this.emitMenuStateChanged();
      if (this.mainWindows.size === 0 && !this.allowAppQuit) {
        this.setActivationMode('accessory');
      }
    });

    this.configureWindowPolicy(window);

    window.webContents.on('context-menu', (event, params) => {
      if (params.isEditable || params.selectionText.trim()) {
        return;
      }

      event.preventDefault();
    });

    window.webContents.on('did-finish-load', () => {
      this.flushPendingMainWindowCommands(window);
    });

    window.webContents.on('render-process-gone', () => unresponsiveSampler.stopAndFlush());
    this.configureWindowRecovery(window, rendererUrl, 'HackDesk');
    window.on('unresponsive', () => {
      writeLog('renderer', 'main window became unresponsive', undefined, 'warn');
      unresponsiveSampler.start();
      void this.showRecoveryDialog(window, rendererUrl, 'HackDesk is not responding', 'You can wait, reload the app window, or export debug logs.', true);
    });
    window.on('responsive', () => {
      unresponsiveSampler.stopAndFlush();
      writeLog('renderer', 'main window became responsive');
    });

    void window.loadURL(rendererUrl).catch(error => writeLog('renderer', 'HackDesk load failed', error, 'error'));
    return window;
  }

  private trackMainWindowFocus(window: BrowserWindow) {
    this.mainWindowFocusOrder = this.mainWindowFocusOrder.filter((candidate) => candidate !== window);
    this.mainWindowFocusOrder.push(window);
    this.emitMenuStateChanged();
  }

  private flushPendingMainWindowCommands(target?: BrowserWindow) {
    const window = target ?? this.getMainWindow();
    if (!window || window.webContents.isDestroyed() || this.pendingMainWindowCommands.length === 0) {
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

  private sendWindowPresentationState(window: BrowserWindow, fullScreen: boolean) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(ELECTRON_CHANNELS.appWindowPresentationStateChanged, { fullScreen });
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

  private configureWindowPolicy(window: BrowserWindow) {
    const { session } = window.webContents;

    session.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (isGrantedRendererPermission(permission, details.requestingUrl)) {
        callback(true);
        return;
      }
      writeLog('security', 'permission request denied', {
        permission,
        requestingUrl: details.requestingUrl,
        currentUrl: webContents.getURL(),
      }, 'warn');
      callback(false);
    });

    session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      if (isGrantedRendererPermission(permission, requestingOrigin)) {
        return true;
      }
      writeLog('security', 'permission check denied', {
        permission,
        requestingOrigin,
        currentUrl: webContents?.getURL(),
      }, 'warn');
      return false;
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      void openExternalUrl(url).catch((error) => writeLog('navigation', 'failed to open external URL', error, 'warn'));
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (url === window.webContents.getURL() || isTrustedRendererUrl(url)) {
        return;
      }
      event.preventDefault();
      void openExternalUrl(url).catch((error) => writeLog('navigation', 'failed to open external navigation', error, 'warn'));
    });
  }

  private handleCloseRequest(event: Electron.Event, window: BrowserWindow) {
    if (this.allowAppQuit) {
      return;
    }

    if (!this.mainWindows.has(window)) {
      return;
    }

    if (window.webContents.isDestroyed() || !window.webContents.mainFrame) {
      return;
    }

    event.preventDefault();
    writeLog('main', 'window close requested', { source: 'window-button' });
    this.sendCloseRequest(window, 'window-button');
  }

  private sendCloseRequest(window: BrowserWindow, source: import('../../../src/lib/electron-api').HackDeskCloseRequestSource) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }
    this.pendingCloseByWindow.set(window, { source, timeout: null });
    window.webContents.send(ELECTRON_CHANNELS.appCloseRequested, { source });
    this.startPendingCloseTimeout(window, source);
  }

  private startPendingCloseTimeout(window: BrowserWindow, source: import('../../../src/lib/electron-api').HackDeskCloseRequestSource) {
    this.clearPendingCloseTimeout(window);
    if (window.isDestroyed() || !this.pendingCloseByWindow.has(window)) return;
    const timeout = setTimeout(() => {
      if (window.isDestroyed() || !this.mainWindows.has(window)) return;
      const current = this.pendingCloseByWindow.get(window);
      if (!current || current.source !== source) return;

      writeLog('main', 'renderer did not respond to close request', undefined, 'warn');
      void dialog.showMessageBox(window, {
        type: 'warning',
        title: app.getName(),
        message: 'HackDesk is still checking for unsaved changes.',
        detail: 'Wait for the app to respond, or quit without saving.',
        buttons: ['Wait', 'Quit without saving'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      }).then(({ response }) => {
        if (window.isDestroyed() || !this.mainWindows.has(window)) return;
        const latest = this.pendingCloseByWindow.get(window);
        if (!latest || latest.source !== source) return;
        if (response === 1) {
          this.allowAppQuit = true;
          app.quit();
        } else {
          this.pendingCloseByWindow.delete(window);
        }
      }).catch(error => writeLog('main', 'window close dialog failed', error, 'error'));
    }, 15_000);
    this.pendingCloseByWindow.set(window, { source, timeout });
  }

  private clearPendingCloseTimeout(window?: BrowserWindow) {
    if (window) {
      const pending = this.pendingCloseByWindow.get(window);
      if (pending?.timeout) {
        clearTimeout(pending.timeout);
        this.pendingCloseByWindow.set(window, { source: pending.source, timeout: null });
      }
      return;
    }
    for (const [candidate, pending] of this.pendingCloseByWindow) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
        this.pendingCloseByWindow.set(candidate, { source: pending.source, timeout: null });
      }
    }
  }

  private configureWindowRecovery(window: BrowserWindow, rendererUrl: string, name: string) {
    const onLoadFailure = (_event: Electron.Event, errorCode: number, errorDescription: string, validatedUrl: string, isMainFrame: boolean) => {
      if (errorCode === -3 || !isMainFrame || !isTrustedRendererUrl(validatedUrl)) return;
      writeLog('renderer', 'renderer failed to load', { window: name, errorCode, errorDescription, validatedUrl }, 'error');
      void this.showRecoveryDialog(window, rendererUrl, `${name} failed to load`, errorDescription);
    };
    window.webContents.on('did-fail-load', onLoadFailure);
    window.webContents.on('did-fail-provisional-load', onLoadFailure);
    window.webContents.on('render-process-gone', (_event, details) => {
      writeLog('renderer', 'render process gone', { window: name, ...details }, 'error');
      void this.showRecoveryDialog(window, rendererUrl, `${name} renderer stopped`, `Reason: ${details.reason}. Exit code: ${details.exitCode}.`);
    });
    window.webContents.on('preload-error', (_event, preloadPath, error) => {
      writeLog('renderer', 'preload script failed', { window: name, preloadPath, error: error.message, stack: error.stack }, 'error');
      void this.showRecoveryDialog(window, rendererUrl, `${name} preload failed`, error.message);
    });
    window.once('closed', () => this.recoveryDialogs.delete(window));
  }

  private async showRecoveryDialog(window: BrowserWindow, rendererUrl: string, message: string, detail: string, canKeepWaiting = false) {
    if (window.isDestroyed() || window.webContents.isDestroyed() || this.recoveryDialogs.has(window)) {
      return;
    }

    this.recoveryDialogs.add(window);
    const buttons = canKeepWaiting
      ? ['Reload', 'Export Logs', 'Relaunch', 'Keep Waiting']
      : ['Reload', 'Export Logs', 'Relaunch', 'Quit'];

    try {
      const result = await dialog.showMessageBox(window, {
        type: 'warning',
        title: app.getName(),
        message,
        detail,
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1,
        noLink: true,
      });
      if (window.isDestroyed() || window.webContents.isDestroyed()) return;
      switch (buttons[result.response]) {
      case 'Reload':
        await window.loadURL(rendererUrl);
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
    } catch (error) {
      writeLog('main', 'window recovery failed', error, 'error');
    } finally {
      this.recoveryDialogs.delete(window);
    }
  }
}
