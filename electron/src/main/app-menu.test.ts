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

import { createApplicationMenu } from './app-menu';

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

describe('createApplicationMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses shortcut overrides for native menu accelerators', () => {
    createApplicationMenu(vi.fn(), {
      'open-command-palette': 'mod+j',
      'open-quick-open': 'none',
    }, vi.fn());

    expect(findMenuItem('Command Palette')).toMatchObject({
      accelerator: process.platform === 'darwin' ? 'Command+J' : 'Ctrl+J',
    });
    expect(findMenuItem('Quick Open')?.accelerator).toBeUndefined();
    expect(menuMock.setApplicationMenu).toHaveBeenCalledOnce();
  });

  it('uses the default markdown import accelerator', () => {
    createApplicationMenu(vi.fn(), {}, vi.fn());

    expect(findMenuItem('Import Markdown Note')).toMatchObject({
      accelerator: process.platform === 'darwin' ? 'Command+O' : 'Ctrl+O',
    });
  });

  it('keeps Close Tab on Cmd+W and gives Close Window a separate accelerator on macOS', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const sendCommand = vi.fn();
    const closeMainWindow = vi.fn();
    createApplicationMenu(sendCommand, {}, closeMainWindow);

    expect(findMenuItem('Close Tab')?.accelerator).toBe('Command+W');
    expect(findMenuItem('Close Window')).toMatchObject({ accelerator: 'Command+Shift+W' });

    findMenuItem('Close Window')?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
    expect(closeMainWindow).toHaveBeenCalledOnce();
    expect(sendCommand).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
