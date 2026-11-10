import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuMock = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => template),
  setApplicationMenu: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getName: () => 'HackDesk',
  },
  Menu: menuMock,
}));

vi.mock('./url-policy', () => ({
  openExternalUrl: vi.fn(),
}));

import { attachWindowMenu, buildMenuTemplate, createApplicationMenu, type ApplicationMenuOptions } from './app-menu';

function defaultOptions(overrides: Partial<ApplicationMenuOptions> = {}): ApplicationMenuOptions {
  return {
    sendCommand: vi.fn(),
    shortcuts: {},
    closeWindow: vi.fn(),
    newWindow: vi.fn(),
    focusWindow: vi.fn(),
    windows: [],
    characterShortcutsEnabled: true,
    ...overrides,
  };
}

function currentTemplate() {
  return menuMock.buildFromTemplate.mock.calls.at(-1)?.[0] as Electron.MenuItemConstructorOptions[];
}

function findMenuItem(label: string) {
  for (const section of currentTemplate()) {
    const submenu = section.submenu as Electron.MenuItemConstructorOptions[] | undefined;
    const item = submenu?.find((candidate) => candidate.label === label);
    if (item) {
      return item;
    }
  }

  return undefined;
}

function findSection(label: string) {
  return currentTemplate().find((section) => section.label === label);
}

describe('createApplicationMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses shortcut overrides for native menu accelerators', () => {
    createApplicationMenu(defaultOptions({
      shortcuts: {
        'new-note': 'mod+j',
        'open-quick-open': 'none',
      },
    }));

    expect(findMenuItem('New Note')).toMatchObject({
      accelerator: process.platform === 'darwin' ? 'Command+J' : 'Ctrl+J',
    });
    expect(findMenuItem('Quick Open')?.accelerator).toBeUndefined();
    expect(menuMock.setApplicationMenu).toHaveBeenCalledOnce();
  });

  it('leaves the command palette shortcut to the renderer so the editor can use ⌘K first', () => {
    createApplicationMenu(defaultOptions());
    const view = currentTemplate().flatMap(section => (section.submenu as Electron.MenuItemConstructorOptions[] | undefined) ?? []);
    const palette = view.find(entry => entry.label?.startsWith('Command Palette'));
    expect(palette?.accelerator).toBeUndefined();
    expect(palette?.label).toContain(process.platform === 'darwin' ? '⌘K' : 'Ctrl+K');
  });

  it('displays contextual keys without registering native accelerators', () => {
    const send = vi.fn();
    createApplicationMenu(defaultOptions({
      sendCommand: send,
      shortcuts: { 'show-keyboard-shortcuts': 'mod+j', 'search-notes': 'none' },
    }));
    const help = currentTemplate().find(section => section.label === 'Help')?.submenu as Electron.MenuItemConstructorOptions[];
    const item = help.find(entry => entry.label?.startsWith('Keyboard Shortcuts'));
    expect(item?.label).toContain(process.platform === 'darwin' ? '⌘J' : 'Ctrl+J');
    expect(item?.accelerator).toBeUndefined();
    item?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
    expect(send).toHaveBeenCalledWith({ type: 'show-keyboard-shortcuts' }, null);
    // A click from an accelerator tells the page it was a key, so an unavailable action stays quiet.
    item?.click?.({} as Electron.MenuItem, undefined, { triggeredByAccelerator: true } as Electron.KeyboardEvent);
    expect(send).toHaveBeenLastCalledWith({ type: 'show-keyboard-shortcuts', fromShortcut: true }, null);
    expect(findMenuItem('Focus Note Finder')?.accelerator).toBeUndefined();
    createApplicationMenu(defaultOptions({ sendCommand: send, characterShortcutsEnabled: false }));
    const disabledHelp = currentTemplate().find(section => section.label === 'Help')?.submenu as Electron.MenuItemConstructorOptions[];
    expect(disabledHelp[0].label).toBe('Keyboard Shortcuts');
  });

  it('uses the default markdown import accelerator', () => {
    createApplicationMenu(defaultOptions());

    expect(findMenuItem('Import Markdown Note')).toMatchObject({
      accelerator: process.platform === 'darwin' ? 'Command+O' : 'Ctrl+O',
    });
  });

  it('keeps Close Tab on Cmd+W and gives Close Window a separate accelerator on macOS', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const sendCommand = vi.fn();
    const closeWindow = vi.fn();
    createApplicationMenu(defaultOptions({ sendCommand, closeWindow }));

    expect(findMenuItem('Close Tab')?.accelerator).toBe('Command+W');
    expect(findMenuItem('Close Window')).toMatchObject({ accelerator: 'Command+Shift+W' });

    const sourceWindow = { id: 7 };
    findMenuItem('Close Window')?.click?.({} as Electron.MenuItem, sourceWindow as never, {} as Electron.KeyboardEvent);
    expect(closeWindow).toHaveBeenCalledWith(sourceWindow);
    expect(sendCommand).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('opens a new window directly from the File menu', () => {
    const sendCommand = vi.fn();
    const newWindow = vi.fn();
    createApplicationMenu(defaultOptions({ sendCommand, newWindow }));

    const item = findMenuItem('New Window');
    expect(item).toMatchObject({ accelerator: process.platform === 'darwin' ? 'Command+Alt+N' : 'Ctrl+Alt+N' });
    item?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
    expect(newWindow).toHaveBeenCalledOnce();
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('routes action clicks to the window whose menu was clicked', () => {
    const sendCommand = vi.fn();
    createApplicationMenu(defaultOptions({ sendCommand }));

    const sourceWindow = { id: 3 };
    findMenuItem('Save Note')?.click?.({} as Electron.MenuItem, sourceWindow as never, {} as Electron.KeyboardEvent);
    expect(sendCommand).toHaveBeenCalledWith({ type: 'save-note' }, sourceWindow);
  });

  it('keeps note actions in a Note menu instead of growing File', () => {
    createApplicationMenu(defaultOptions());

    const file = findSection('File')?.submenu as Electron.MenuItemConstructorOptions[];
    const note = findSection('Note')?.submenu as Electron.MenuItemConstructorOptions[];
    const fileLabels = file.map((item) => item.label);
    const noteLabels = note.map((item) => item.label);

    expect(fileLabels).toContain('New Window');
    expect(fileLabels).not.toContain('Rename Note');
    expect(noteLabels).toEqual(expect.arrayContaining([
      'Rename Note',
      'Duplicate Note',
      'Move Note to Folder…',
      'Delete Note',
    ]));
  });

  it('lists open windows in the Window menu with the focused one checked', () => {
    const focusWindow = vi.fn();
    const first = { id: 1 };
    const second = { id: 2 };
    createApplicationMenu(defaultOptions({
      focusWindow,
      windows: [
        { window: first as never, title: 'First note', focused: false },
        { window: second as never, title: '', focused: true },
      ],
    }));

    const windowSection = findSection('Window')?.submenu as Electron.MenuItemConstructorOptions[];
    const entries = windowSection.filter((item) => item.type === 'checkbox');
    expect(entries.map((item) => item.label)).toEqual(['First note', 'Window 2']);
    expect(entries.map((item) => item.checked)).toEqual([false, true]);

    entries[0]?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
    expect(focusWindow).toHaveBeenCalledWith(first);
  });

  it('attaches a per-window menu bar on Linux and Windows', () => {
    const window = { setMenu: vi.fn() };
    attachWindowMenu(window as never, defaultOptions());

    expect(window.setMenu).toHaveBeenCalledOnce();
    const attached = window.setMenu.mock.calls[0][0] as Electron.MenuItemConstructorOptions[];
    expect(attached.map((section) => section.label)).toEqual(
      buildMenuTemplate(defaultOptions()).map((section) => section.label),
    );
  });
});
