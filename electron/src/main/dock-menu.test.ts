import { beforeEach, describe, expect, it, vi } from 'vitest';

const dockMocks = vi.hoisted(() => ({
  dock: { setMenu: vi.fn() } as { setMenu: ReturnType<typeof vi.fn> } | undefined,
  buildFromTemplate: vi.fn((template: unknown) => template),
}));

vi.mock('electron', () => ({
  app: {
    get dock() {
      return dockMocks.dock;
    },
  },
  Menu: { buildFromTemplate: dockMocks.buildFromTemplate },
}));

import { buildDockMenuTemplate, updateDockMenu } from './dock-menu';

const settings = {
  localVault: {
    vaults: [
      { id: 'vault-notes', path: '/Users/me/Notes' },
      { id: 'vault-work', path: 'C:\\Users\\me\\Work\\' },
    ],
    workspaces: [{ id: 'ws-writing', name: 'Writing', vaultIds: ['vault-notes'] }],
  },
};

describe('buildDockMenuTemplate', () => {
  it('lists vaults by folder name, then workspaces, and opens each in a new window', () => {
    const open = vi.fn();
    const template = buildDockMenuTemplate(settings, open);

    expect(template.map((item) => item.label ?? item.type)).toEqual(['Notes', 'Work', 'separator', 'Writing']);
    template[0].click?.({} as never, undefined, {} as never);
    template[3].click?.({} as never, undefined, {} as never);
    expect(open).toHaveBeenNthCalledWith(1, { type: 'local', label: 'Notes', vaultId: 'vault-notes' });
    expect(open).toHaveBeenNthCalledWith(2, { type: 'local', label: 'Writing', workspaceId: 'ws-writing' });
  });

  it('leaves out the separator when only one kind exists, and is empty without vaults', () => {
    expect(buildDockMenuTemplate({ localVault: { vaults: settings.localVault.vaults, workspaces: [] } }, vi.fn())
      .map((item) => item.label)).toEqual(['Notes', 'Work']);
    expect(buildDockMenuTemplate({}, vi.fn())).toEqual([]);
  });
});

describe('updateDockMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dockMocks.dock = { setMenu: vi.fn() };
  });

  it('sets the dock menu on macOS', () => {
    updateDockMenu(settings, vi.fn());
    expect(dockMocks.dock?.setMenu).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a dock', () => {
    dockMocks.dock = undefined;
    updateDockMenu(settings, vi.fn());
    expect(dockMocks.buildFromTemplate).not.toHaveBeenCalled();
  });
});
