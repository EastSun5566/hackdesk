import { app, Menu, type BrowserWindow } from 'electron';

import { getElectronAction, resolveWorkbenchShortcut } from '../../../src/lib/electron-actions';
import type { ElectronActionId, HackDeskCommandPaletteCommand, PopupMenuInput } from '../../../src/lib/electron-api';
import { ELECTRON_MENU_SCHEMA, type ElectronMenuSchemaItem } from '../../../src/lib/electron-menu-schema';
import { displayShortcutConfig, toMenuAccelerator, type ShortcutOverrides } from '../../../src/lib/keyboard-shortcuts';
import { openExternalUrl } from './url-policy';

export type MenuCommandSender = (
  command: HackDeskCommandPaletteCommand,
  sourceWindow?: BrowserWindow | null,
) => void;

export type MenuWindowEntry = {
  window: BrowserWindow;
  title: string;
  focused: boolean;
};

export type ApplicationMenuOptions = {
  sendCommand: MenuCommandSender;
  shortcuts: ShortcutOverrides;
  closeWindow: (target?: BrowserWindow | null) => void;
  newWindow: () => void;
  focusWindow: (target: BrowserWindow) => void;
  windows: MenuWindowEntry[];
  characterShortcutsEnabled?: boolean;
};

function windowLabel(entry: MenuWindowEntry, index: number) {
  const title = entry.title.trim();
  return title ? title : `Window ${index + 1}`;
}

function actionMenuItem(
  actionId: ElectronActionId,
  sendCommand: MenuCommandSender,
  shortcuts: ShortcutOverrides,
  characterShortcutsEnabled: boolean,
  onNewWindow: () => void,
) {
  const action = getElectronAction(actionId);
  const keybinding = resolveWorkbenchShortcut(actionId, shortcuts, characterShortcutsEnabled);

  // A new window must open even when the focused renderer is busy or gone.
  if (actionId === 'new-window') {
    return {
      label: action.label,
      accelerator: keybinding === 'none' ? undefined : toMenuAccelerator(keybinding, process.platform),
      click: onNewWindow,
    };
  }

  const rendererHandled = Boolean(action.keyboardContext || action.rendererShortcut);
  return {
    label: rendererHandled && keybinding !== 'none' ? `${action.label}    ${displayShortcutConfig(keybinding, process.platform)}`.trimEnd() : action.label,
    accelerator: rendererHandled || keybinding === 'none'
      ? undefined
      : toMenuAccelerator(keybinding, process.platform),
    // Route the command to the window whose menu was clicked, so every window runs its own actions.
    click: (
      _item: Electron.MenuItem,
      sourceWindow: Electron.BaseWindow | undefined,
      event: Electron.KeyboardEvent,
    ) => (
      sendCommand(
        event?.triggeredByAccelerator ? { type: action.id, fromShortcut: true } : { type: action.id },
        (sourceWindow ?? null) as BrowserWindow | null,
      )
    ),
  };
}

function roleMenuItem(
  role: string,
  isMac: boolean,
  closeWindow: (target?: BrowserWindow | null) => void,
): Electron.MenuItemConstructorOptions {
  if (role === 'platform-close') {
    return isMac
      ? {
        label: 'Close Window',
        accelerator: 'Command+Shift+W',
        click: (_item: Electron.MenuItem, sourceWindow: Electron.BaseWindow | undefined) => (
          closeWindow((sourceWindow ?? null) as BrowserWindow | null)
        ),
      }
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
  options: ApplicationMenuOptions,
): Electron.MenuItemConstructorOptions {
  switch (item.type) {
  case 'action':
    return actionMenuItem(
      item.actionId,
      options.sendCommand,
      options.shortcuts,
      options.characterShortcutsEnabled ?? true,
      options.newWindow,
    );
  case 'role':
    return roleMenuItem(item.role, isMac, options.closeWindow);
  case 'link':
    return linkMenuItem(item.label, item.url);
  case 'separator':
    return { type: 'separator' };
  }
}

/**
 * The Window menu lists every open main window after the standard roles, so a window can be
 * picked from any other. The list is point-in-time: it refreshes on open, close, focus and title
 * changes, which is when the menu rebuilds.
 */
function windowSectionItems(
  isMac: boolean,
  options: ApplicationMenuOptions,
): Electron.MenuItemConstructorOptions[] {
  const section = ELECTRON_MENU_SCHEMA.find((candidate) => candidate.id === 'window');
  const items = (section?.items ?? []).map((item) => schemaItemToMenuItem(item, isMac, options));

  if (options.windows.length === 0) {
    return items;
  }

  return [
    ...items,
    { type: 'separator' },
    ...options.windows.map((entry, index) => ({
      label: windowLabel(entry, index),
      type: 'checkbox' as const,
      checked: entry.focused,
      click: () => options.focusWindow(entry.window),
    })),
  ];
}

export function buildMenuTemplate(options: ApplicationMenuOptions): Electron.MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [];

  for (const section of ELECTRON_MENU_SCHEMA) {
    if (section.macOnly && !isMac) {
      continue;
    }

    if (section.id === 'window') {
      template.push({ label: section.label, submenu: windowSectionItems(isMac, options) });
      continue;
    }

    template.push({
      label: section.id === 'app' ? app.getName() : section.label,
      submenu: section.items.map((item) => schemaItemToMenuItem(item, isMac, options)),
    });
  }

  return template;
}

export function createApplicationMenu(options: ApplicationMenuOptions) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(options)));
}

const windowMenus = new WeakMap<BrowserWindow, Menu>();

/**
 * Linux and Windows keep a menu in each window, so each window owns its copy. The window is frameless
 * there, so Electron draws no menu bar: the menu serves its accelerators, and the renderer's own title
 * bar opens it (getWindowMenuBar, popupWindowMenu).
 *
 * Not a documented Electron contract: its views RootView::SetMenu registers the accelerators, then
 * creates no menu bar for a window without a frame. Re-check that a frameless window shows no menu
 * bar, and that its shortcuts still work, after an Electron upgrade.
 */
export function attachWindowMenu(window: BrowserWindow, options: ApplicationMenuOptions) {
  const menu = Menu.buildFromTemplate(buildMenuTemplate(options));
  windowMenus.set(window, menu);
  window.setMenu(menu);
}

/** The top-level entries of a window's menu, as the renderer's menu bar shows them. */
export function getWindowMenuBar(window: BrowserWindow): string[] {
  return (windowMenus.get(window)?.items ?? [])
    .filter((item) => item.submenu && item.visible)
    .map((item) => item.label.replace(/&(.)/g, '$1'));
}

/**
 * Opens one entry of the window's menu, or the whole menu when `section` is null, as a native menu at
 * a point in the window. Resolves once it closes, so the renderer can put its menu bar away.
 *
 * Two Electron behaviours to re-check after an upgrade: `x`/`y` are DIPs from the content area's
 * origin, which the renderer's CSS pixels match at zoom 1; and the close callback runs even when the
 * popup cannot open (for instance over a menu that is already showing). If it did not, this would
 * never resolve and the Alt menu bar would stay out until Escape, a click or the window losing focus.
 */
export function popupWindowMenu(window: BrowserWindow, input: PopupMenuInput) {
  const menu = windowMenus.get(window);
  const sections = menu?.items.filter((item) => item.submenu && item.visible) ?? [];
  const target = input.section === null ? menu : sections[input.section]?.submenu;
  if (!target) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    target.popup({ window, x: input.x, y: input.y, callback: () => resolve(true) });
  });
}
