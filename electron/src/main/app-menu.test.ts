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
    });

    expect(findMenuItem('Command Palette')).toMatchObject({
      accelerator: process.platform === 'darwin' ? 'Command+J' : 'Ctrl+J',
    });
    expect(findMenuItem('Quick Open')?.accelerator).toBeUndefined();
    expect(menuMock.setApplicationMenu).toHaveBeenCalledOnce();
  });

  it('uses the default markdown import accelerator', () => {
    createApplicationMenu(vi.fn());

    expect(findMenuItem('Import Markdown Note')).toMatchObject({
      accelerator: process.platform === 'darwin' ? 'Command+O' : 'Ctrl+O',
    });
  });
});
