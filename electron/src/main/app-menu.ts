import { app, Menu } from 'electron';

import { getElectronAction } from '../../../src/lib/electron-actions';
import type { HackDeskCommandPaletteCommand } from '../../../src/lib/electron-api';
import { ELECTRON_MENU_SCHEMA, type ElectronMenuSchemaItem } from '../../../src/lib/electron-menu-schema';
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

function roleMenuItem(role: string, isMac: boolean): Electron.MenuItemConstructorOptions {
  const resolvedRole = role === 'platform-close'
    ? isMac ? 'close' : 'quit'
    : role;

  return { role: resolvedRole as Electron.MenuItemConstructorOptions['role'] };
}

function linkMenuItem(label: string, url: string): Electron.MenuItemConstructorOptions {
  return {
    label,
    click: () => {
      void openExternalUrl(url);
    },
  };
}

function schemaItemToMenuItem(
  item: ElectronMenuSchemaItem,
  isMac: boolean,
  sendCommand: SendCommand,
): Electron.MenuItemConstructorOptions {
  switch (item.type) {
  case 'action':
    return actionMenuItem(item.actionId, sendCommand);
  case 'role':
    return roleMenuItem(item.role, isMac);
  case 'link':
    return linkMenuItem(item.label, item.url);
  case 'separator':
    return { type: 'separator' };
  }
}

export function createApplicationMenu(sendCommand: SendCommand) {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [];

  for (const section of ELECTRON_MENU_SCHEMA) {
    if (section.macOnly && !isMac) {
      continue;
    }

    template.push({
      label: section.id === 'app' ? app.getName() : section.label,
      submenu: section.items.map((item) => schemaItemToMenuItem(item, isMac, sendCommand)),
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
