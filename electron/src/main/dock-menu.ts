import { app, Menu, type MenuItemConstructorOptions } from 'electron';

import type { LocalVaultSettings } from '../../../src/lib/settings';
import type { WindowWorkspaceScope } from '../../../src/lib/window-workspace';

type DockMenuSettings = { localVault?: Partial<LocalVaultSettings> };

/** The last path segment, which is what a vault is called everywhere but its full path. */
function folderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

/**
 * The dock menu's items: each vault, then each named workspace. Clicking one opens it in a new
 * window, the same way "Open in New Window" does in the workspace switcher.
 */
export function buildDockMenuTemplate(
  settings: DockMenuSettings,
  openWorkspace: (scope: WindowWorkspaceScope) => void,
): MenuItemConstructorOptions[] {
  const vaults = Array.isArray(settings.localVault?.vaults) ? settings.localVault.vaults : [];
  const workspaces = Array.isArray(settings.localVault?.workspaces) ? settings.localVault.workspaces : [];
  const vaultItems = vaults.map((vault): MenuItemConstructorOptions => {
    const label = folderName(vault.path);
    return { label, toolTip: vault.path, click: () => openWorkspace({ type: 'local', label, vaultId: vault.id }) };
  });
  const workspaceItems = workspaces.map((workspace): MenuItemConstructorOptions => ({
    label: workspace.name,
    click: () => openWorkspace({ type: 'local', label: workspace.name, workspaceId: workspace.id }),
  }));
  return [
    ...vaultItems,
    ...(vaultItems.length > 0 && workspaceItems.length > 0 ? [{ type: 'separator' } as const] : []),
    ...workspaceItems,
  ];
}

/**
 * Sets the macOS dock menu from the stored vaults. The dock keeps a snapshot, so this runs again
 * whenever settings change. Other platforms have no dock and skip it.
 */
export function updateDockMenu(settings: DockMenuSettings, openWorkspace: (scope: WindowWorkspaceScope) => void) {
  if (!app.dock) return;
  app.dock.setMenu(Menu.buildFromTemplate(buildDockMenuTemplate(settings, openWorkspace)));
}
