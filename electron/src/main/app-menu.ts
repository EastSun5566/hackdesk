import { app, Menu } from 'electron';

import { getElectronAction } from '../../../src/lib/electron-actions';
import type { HackDeskCommandPaletteCommand } from '../../../src/lib/electron-api';
import { openExternalUrl } from './url-policy';

type SendCommand = (command: HackDeskCommandPaletteCommand) => void;

function actionMenuItem(actionId: HackDeskCommandPaletteCommand['type'], sendCommand: SendCommand) {
  const action = getElectronAction(actionId);

  return {
    label: action.label,
    accelerator: action.menuAccelerator,
    click: () => sendCommand({ type: action.id }),
  };
}

export function createApplicationMenu(sendCommand: SendCommand) {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
        label: app.getName(),
        submenu: [
          { role: 'about' as const },
          { type: 'separator' as const },
          actionMenuItem('open-settings', sendCommand),
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
        actionMenuItem('new-note', sendCommand),
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
        actionMenuItem('open-command-palette', sendCommand),
        actionMenuItem('refresh', sendCommand),
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        actionMenuItem('export-debug-logs', sendCommand),
        { type: 'separator' },
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
