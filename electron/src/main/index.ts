import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';

import type { HackDeskCommandPaletteCommand } from '../../../src/lib/electron-api';
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

function sendCommand(command: HackDeskCommandPaletteCommand) {
  const focusedWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;

  if (!focusedWindow || focusedWindow.isDestroyed()) {
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
    backgroundColor: '#f7f7f8',
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
  const icon = nativeImage.createFromPath(join(__dirname, '../../src-tauri/icons/32x32.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
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
}

app.setName('HackDesk');

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
