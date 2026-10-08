import { app, Menu } from 'electron';

import { getElectronAction, resolveWorkbenchShortcut } from '../../../src/lib/electron-actions';
import type { ElectronActionId, HackDeskCommandPaletteCommand } from '../../../src/lib/electron-api';
import { ELECTRON_MENU_SCHEMA, type ElectronMenuSchemaItem } from '../../../src/lib/electron-menu-schema';
import { displayShortcutConfig, toMenuAccelerator, type ShortcutOverrides } from '../../../src/lib/keyboard-shortcuts';
import { openExternalUrl } from './url-policy';

type SendCommand = (command: HackDeskCommandPaletteCommand) => void;

function actionMenuItem(
  actionId: ElectronActionId,
  sendCommand: SendCommand,
  shortcuts: ShortcutOverrides,
  characterShortcutsEnabled: boolean,
) {
  const action = getElectronAction(actionId);
  const keybinding = resolveWorkbenchShortcut(actionId, shortcuts, characterShortcutsEnabled);

  return {
    label: action.keyboardContext && keybinding !== 'none' ? `${action.label}    ${displayShortcutConfig(keybinding, process.platform)}`.trimEnd() : action.label,
    accelerator: action.keyboardContext || keybinding === 'none'
      ? undefined
      : toMenuAccelerator(keybinding, process.platform),
    click: () => sendCommand({ type: action.id }),
  };
}

function roleMenuItem(role: string, isMac: boolean, closeMainWindow: () => void): Electron.MenuItemConstructorOptions {
  if (role === 'platform-close') {
    return isMac
      ? { label: 'Close Window', accelerator: 'Command+Shift+W', click: closeMainWindow }
      : { role: 'quit' };
  }

  return { role: role as Electron.MenuItemConstructorOptions['role'] };
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
  shortcuts: ShortcutOverrides,
  characterShortcutsEnabled: boolean,
  closeMainWindow: () => void,
): Electron.MenuItemConstructorOptions {
  switch (item.type) {
  case 'action':
    return actionMenuItem(item.actionId, sendCommand, shortcuts, characterShortcutsEnabled);
  case 'role':
    return roleMenuItem(item.role, isMac, closeMainWindow);
  case 'link':
    return linkMenuItem(item.label, item.url);
  case 'separator':
    return { type: 'separator' };
  }
}

export function createApplicationMenu(
  sendCommand: SendCommand,
  shortcuts: ShortcutOverrides,
  closeMainWindow: () => void,
  characterShortcutsEnabled = true,
) {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [];

  for (const section of ELECTRON_MENU_SCHEMA) {
    if (section.macOnly && !isMac) {
      continue;
    }

    template.push({
      label: section.id === 'app' ? app.getName() : section.label,
      submenu: section.items.map((item) => schemaItemToMenuItem(item, isMac, sendCommand, shortcuts, characterShortcutsEnabled, closeMainWindow)),
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
