import { BrowserWindow } from 'electron';
import { join } from 'node:path';

import type { HackDeskCommandPaletteCommand } from '../../../src/lib/electron-api';
import { getRendererEntryUrl } from './paths';
import { openExternalUrl } from './url-policy';
import { getAppIconPath } from './app-icon';
import { ELECTRON_CHANNELS } from '../shared/channels';

const WINDOW_BACKGROUND_COLOR = process.platform === 'darwin' ? '#00000000' : '#fdfdfd';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  getMainWindow() {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null;
  }

  getTargetWindow() {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? this.getMainWindow();
    return focusedWindow && !focusedWindow.isDestroyed() ? focusedWindow : null;
  }

  sendCommand(command: HackDeskCommandPaletteCommand) {
    this.getTargetWindow()?.webContents.send(ELECTRON_CHANNELS.appCommand, command);
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

  createMainWindow() {
    const isMac = process.platform === 'darwin';
    const rendererUrl = getRendererEntryUrl();
    const rendererOrigin = rendererUrl.split('#', 1)[0];

    this.mainWindow = new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 900,
      minHeight: 620,
      show: false,
      title: 'HackDesk',
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
      backgroundColor: WINDOW_BACKGROUND_COLOR,
      vibrancy: isMac ? 'sidebar' : undefined,
      visualEffectState: isMac ? 'active' : undefined,
      icon: getAppIconPath(),
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: false,
      },
    });

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    this.mainWindow.webContents.on('context-menu', (event, params) => {
      if (params.isEditable || params.selectionText.trim()) {
        return;
      }

      event.preventDefault();
    });

    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void openExternalUrl(url).catch((error) => {
        console.warn(`Failed to open external URL: ${error instanceof Error ? error.message : String(error)}`);
      });

      return { action: 'deny' };
    });

    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url === this.mainWindow?.webContents.getURL() || url.startsWith(rendererOrigin)) {
        return;
      }

      event.preventDefault();
      void openExternalUrl(url).catch((error) => {
        console.warn(`Failed to open external URL: ${error instanceof Error ? error.message : String(error)}`);
      });
    });

    this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
      if (validatedUrl !== rendererUrl || errorCode === -3) {
        return;
      }

      console.warn(`Renderer failed to load: ${errorDescription}`);
      setTimeout(() => {
        if (!this.mainWindow?.isDestroyed()) {
          void this.mainWindow?.loadURL(rendererUrl);
        }
      }, 600);
    });

    void this.mainWindow.loadURL(rendererUrl);
    return this.mainWindow;
  }
}
