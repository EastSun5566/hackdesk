import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfirmDialogOptions, HackDeskCommandPaletteCommand } from '../../../src/lib/electron-api';
import { getRendererEntryUrl } from './paths';
import { getSafeSettings, updateStoredSettings } from './settings';
import {
  createNote,
  createTeamNote,
  deleteNote,
  deleteTeamNote,
  getCurrentUser,
  getNote,
  listHistory,
  listNotes,
  listTeamNotes,
  listTeams,
  updateNote,
  updateTeamNote,
} from './hackmd-service';
import { openExternalUrl, openHackmdEditor } from './url-policy';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const WINDOW_BACKGROUND_COLOR = process.platform === 'darwin' ? '#00000000' : '#fdfdfd';
const APP_ID = 'me.eastsun.hackdesk';

function getAppIconPath() {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'assets/icon.png')]
    : [
      join(__dirname, '../../build/icon.png'),
      join(__dirname, '../../docs/public/logo.png'),
      join(__dirname, '../../src-tauri/icons/icon.png'),
    ];

  return candidates.find((candidate) => existsSync(candidate));
}

function createAppIcon() {
  const iconPath = getAppIconPath();
  return iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}

function getTargetWindow() {
  const focusedWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  return focusedWindow && !focusedWindow.isDestroyed() ? focusedWindow : null;
}

function sendCommand(command: HackDeskCommandPaletteCommand) {
  const focusedWindow = getTargetWindow();

  if (!focusedWindow) {
    return;
  }

  focusedWindow.webContents.send('app:command', command);
}

function createMainWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('context-menu', (event, params) => {
    if (params.isEditable || params.selectionText.trim()) {
      return;
    }

    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url).catch((error) => {
      console.warn(`Failed to open external URL: ${error instanceof Error ? error.message : String(error)}`);
    });

    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === mainWindow?.webContents.getURL()) {
      return;
    }

    const rendererUrl = getRendererEntryUrl();
    if (url.startsWith(rendererUrl.split('#', 1)[0])) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url).catch((error) => {
      console.warn(`Failed to open external URL: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  void mainWindow.loadURL(getRendererEntryUrl());
}

function createMenu() {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
        label: 'HackDesk',
        submenu: [
          { role: 'about' as const },
          { type: 'separator' as const },
          {
            label: 'Settings…',
            accelerator: 'CmdOrCtrl+,',
            click: () => sendCommand({ type: 'open-settings' }),
          },
          { type: 'separator' as const },
          { role: 'hide' as const },
          { role: 'hideOthers' as const },
          { role: 'unhide' as const },
          { type: 'separator' as const },
          { role: 'quit' as const },
        ],
      }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendCommand({ type: 'new-note' }),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendCommand({ type: 'open-command-palette' }),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'HackDesk Documentation',
          click: () => {
            void openExternalUrl('https://hackdesk.eastsun.me');
          },
        },
        {
          label: 'HackMD API',
          click: () => {
            void openExternalUrl('https://api.hackmd.io/v1/docs/swagger.json');
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const icon = createAppIcon();
  const trayIcon = process.platform === 'darwin'
    ? icon.resize({ width: 18, height: 18, quality: 'best' })
    : icon.resize({ width: 16, height: 16, quality: 'best' });

  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
  }

  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip('HackDesk');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show HackDesk',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]));
}

function registerIpcHandlers() {
  ipcMain.handle('settings:get', () => getSafeSettings());
  ipcMain.handle('settings:update', (_event, settings) => updateStoredSettings(settings));
  ipcMain.handle('hackmd:get-current-user', () => getCurrentUser());
  ipcMain.handle('hackmd:list-teams', () => listTeams());
  ipcMain.handle('hackmd:list-notes', () => listNotes());
  ipcMain.handle('hackmd:list-team-notes', (_event, teamPath: string) => listTeamNotes(teamPath));
  ipcMain.handle('hackmd:list-history', (_event, limit?: number) => listHistory(limit));
  ipcMain.handle('hackmd:get-note', (_event, noteId: string, teamPath?: string | null) => getNote(noteId, teamPath));
  ipcMain.handle('hackmd:create-note', (_event, input) => createNote(input));
  ipcMain.handle('hackmd:create-team-note', (_event, teamPath: string, input) => createTeamNote(teamPath, input));
  ipcMain.handle('hackmd:update-note', (_event, noteId: string, input) => updateNote(noteId, input));
  ipcMain.handle('hackmd:update-team-note', (_event, teamPath: string, noteId: string, input) => updateTeamNote(teamPath, noteId, input));
  ipcMain.handle('hackmd:delete-note', (_event, noteId: string) => deleteNote(noteId));
  ipcMain.handle('hackmd:delete-team-note', (_event, teamPath: string, noteId: string) => deleteTeamNote(teamPath, noteId));
  ipcMain.handle('shell:open-external', (_event, url: string) => openExternalUrl(url));
  ipcMain.handle('shell:open-hackmd-editor', (_event, note) => openHackmdEditor(note));
  ipcMain.handle('app:confirm', async (_event, options: ConfirmDialogOptions) => {
    const confirmLabel = options.confirmLabel ?? 'OK';
    const cancelLabel = options.cancelLabel ?? 'Cancel';
    const result = await dialog.showMessageBox(getTargetWindow() ?? undefined, {
      type: options.destructive ? 'warning' : 'question',
      title: options.title ?? app.getName(),
      message: options.message,
      detail: options.detail,
      buttons: [confirmLabel, cancelLabel],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });

    return { confirmed: result.response === 0 };
  });
}

app.setName('HackDesk');
app.setAppUserModelId(APP_ID);

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  app.dock?.setIcon(createAppIcon());
  registerIpcHandlers();
  createMenu();
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
