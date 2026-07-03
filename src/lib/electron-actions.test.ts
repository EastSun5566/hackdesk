import { describe, expect, it } from 'vitest';

import {
  ELECTRON_ACTIONS,
  getActionDisabledReason,
  getActionShortcut,
  getActionShortcutKeys,
  getCommandPaletteActions,
  getElectronActionLabel,
  getElectronAction,
  isElectronActionEnabled,
  splitShortcutKeys,
  type ElectronActionContext,
} from './electron-actions';
import { ELECTRON_MENU_SCHEMA } from './electron-menu-schema';

const baseContext: ElectronActionContext = {
  editorMode: 'standard',
  hasToken: true,
  canCreate: true,
  scopeType: 'personal',
  selectedFolderId: 'folder-1',
  canModifySelectedFolder: true,
  selectedNoteId: 'note-1',
  noteDirty: true,
  isSavingNote: false,
  openTabCount: 2,
  activePaneTabCount: 2,
  activePaneTabsToRightCount: 1,
  navigationBackCount: 1,
  navigationForwardCount: 1,
  recentlyClosedTabCount: 1,
  paneCount: 1,
  inspectorCollapsed: false,
  navigatorCollapsed: false,
  workspaceRailCollapsed: false,
};

describe('electron action registry', () => {
  it('keeps action IDs unique and exposes menu shortcuts', () => {
    const ids = ELECTRON_ACTIONS.map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(getElectronAction('new-note')).toMatchObject({
      label: 'New Note',
      menuAccelerator: 'Command+N',
    });
    expect(getElectronAction('new-folder')).toMatchObject({
      label: 'New Folder',
      menuAccelerator: 'Shift+CmdOrCtrl+N',
    });
    expect(getElectronAction('open-command-palette')).toMatchObject({
      shortcut: '⌘K',
      menuAccelerator: 'CmdOrCtrl+K',
    });
    expect(getElectronAction('new-tab')).toMatchObject({
      label: 'New Tab',
      shortcut: '⌘T',
      menuAccelerator: 'CmdOrCtrl+T',
    });
    expect(getElectronAction('toggle-theme')).toMatchObject({
      label: 'Toggle Theme',
    });
    expect(getElectronAction('toggle-theme').shortcut).toBeUndefined();
    expect(getElectronAction('toggle-theme').menuAccelerator).toBeUndefined();
    expect(getElectronAction('set-editor-mode-vim')).toMatchObject({
      label: 'Use Vim Editor Mode',
      category: 'app',
    });
    expect(getElectronAction('toggle-workspace-rail')).toMatchObject({
      shortcut: '⌘B',
      menuAccelerator: 'CmdOrCtrl+B',
    });
    expect(getElectronAction('toggle-navigator')).toMatchObject({
      label: 'Toggle Note Navigator',
      shortcut: '⌥⌘B',
      menuAccelerator: 'CmdOrCtrl+Alt+B',
    });
    expect(getElectronAction('export-debug-logs')).toMatchObject({
      label: 'Export Debug Logs',
      menuAccelerator: 'Shift+CmdOrCtrl+L',
    });
    expect(getElectronAction('save-note')).toMatchObject({
      category: 'note',
      shortcut: '⌘S',
      menuAccelerator: 'CmdOrCtrl+S',
    });
    expect(getElectronAction('find-in-note')).toMatchObject({
      shortcut: '⌘F',
      menuAccelerator: 'CmdOrCtrl+F',
    });
    expect(getElectronAction('search-notes')).toMatchObject({
      shortcut: '⇧⌘F',
      menuAccelerator: 'Shift+CmdOrCtrl+F',
    });
    expect(getElectronAction('navigate-back')).toMatchObject({
      shortcut: '⌘[',
      menuAccelerator: 'CmdOrCtrl+[',
    });
    expect(getElectronAction('navigate-forward')).toMatchObject({
      shortcut: '⌘]',
      menuAccelerator: 'CmdOrCtrl+]',
    });
    expect(getElectronAction('export-note-markdown')).toMatchObject({
      label: 'Export Note as Markdown',
    });
    expect(getElectronAction('export-note-markdown').menuAccelerator).toBeUndefined();
    expect(getElectronAction('attach-image')).toMatchObject({
      label: 'Attach Image...',
    });
    expect(getElectronAction('attach-image').shortcut).toBeUndefined();
    expect(getElectronAction('attach-image').menuAccelerator).toBeUndefined();
    expect(getElectronAction('import-markdown-note')).toMatchObject({
      label: 'Import Markdown Note',
      menuAccelerator: 'Shift+CmdOrCtrl+I',
    });
    expect(getElectronAction('close-tab')).toMatchObject({
      label: 'Close Tab',
      menuAccelerator: 'CmdOrCtrl+W',
    });
    expect(getElectronAction('reopen-last-closed-tab')).toMatchObject({
      label: 'Reopen Last Closed Tab',
      menuAccelerator: 'Shift+CmdOrCtrl+T',
    });
    expect(getElectronAction('focus-next-tab')).toMatchObject({
      shortcut: '⌥⌘→',
      menuAccelerator: 'CmdOrCtrl+Alt+Right',
    });
    expect(getElectronAction('focus-previous-tab')).toMatchObject({
      shortcut: '⌥⌘←',
      menuAccelerator: 'CmdOrCtrl+Alt+Left',
    });
    expect(getElectronAction('focus-next-pane').shortcut).toBeUndefined();
    expect(getElectronAction('focus-next-pane').menuAccelerator).toBeUndefined();
    expect(getElectronAction('focus-previous-pane').shortcut).toBeUndefined();
    expect(getElectronAction('focus-previous-pane').menuAccelerator).toBeUndefined();
    expect(getElectronAction('focus-navigator')).toMatchObject({
      shortcut: '⇧⌘E',
      menuAccelerator: 'Shift+CmdOrCtrl+E',
    });
    expect(getElectronAction('split-pane-right')).toMatchObject({
      label: 'Split Pane Right',
      shortcut: '⌘\\',
      menuAccelerator: 'CmdOrCtrl+\\',
    });
  });

  it('uses the same registry for command palette actions', () => {
    expect(getCommandPaletteActions().map((action) => action.id)).toEqual(ELECTRON_ACTIONS.map((action) => action.id));
  });

  it('exposes action labels and display shortcut helpers from the registry', () => {
    expect(getElectronActionLabel('toggle-navigator')).toBe('Toggle Note Navigator');
    expect(getActionShortcut('toggle-navigator')).toBe('⌥⌘B');
    expect(getActionShortcutKeys('toggle-navigator')).toEqual(['⌥', '⌘', 'B']);
    expect(splitShortcutKeys('⇧⌘F')).toEqual(['⇧', '⌘', 'F']);
    expect(splitShortcutKeys('⌘\\')).toEqual(['⌘', '\\']);
    expect(getActionShortcutKeys('navigate-back')).toEqual(['⌘', '[']);
    expect(getActionShortcutKeys('navigate-forward')).toEqual(['⌘', ']']);
  });

  it('keeps the native menu schema linked to registered actions', () => {
    const actionIds = new Set(ELECTRON_ACTIONS.map((action) => action.id));
    const menuActionIds = ELECTRON_MENU_SCHEMA.flatMap((section) => (
      section.items.flatMap((item) => item.type === 'action' ? [item.actionId] : [])
    ));

    expect(menuActionIds.length).toBeGreaterThan(0);
    expect(menuActionIds.every((actionId) => actionIds.has(actionId))).toBe(true);
    expect(ELECTRON_MENU_SCHEMA.find((section) => section.id === 'help')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'link', url: 'https://api.hackmd.io/v1/docs/swagger.json' }),
    ]));
  });

  it('exposes categories for grouped command palette rendering', () => {
    expect(ELECTRON_ACTIONS.map((action) => action.category)).toEqual(expect.arrayContaining([
      'create',
      'navigation',
      'view',
      'note',
      'folder',
      'app',
    ]));
  });

  it('reports disabled reasons from shared context', () => {
    expect(isElectronActionEnabled(getElectronAction('save-note'), baseContext)).toBe(true);
    expect(getActionDisabledReason(getElectronAction('save-note'), {
      ...baseContext,
      noteDirty: false,
    })).toBe('No unsaved note changes.');
    expect(getActionDisabledReason(getElectronAction('rename-folder'), {
      ...baseContext,
      selectedFolderId: null,
      canModifySelectedFolder: false,
    })).toBe('Select a folder first.');
    expect(getActionDisabledReason(getElectronAction('new-note'), {
      ...baseContext,
      hasToken: false,
      canCreate: false,
    })).toBe('Connect HackMD in Settings first.');
    expect(getActionDisabledReason(getElectronAction('import-markdown-note'), {
      ...baseContext,
      scopeType: 'history',
      canCreate: false,
    })).toBe('Choose My Workspace or a team first.');
    expect(getActionDisabledReason(getElectronAction('export-note-markdown'), {
      ...baseContext,
      selectedNoteId: null,
    })).toBe('Select a note first.');
    expect(getActionDisabledReason(getElectronAction('attach-image'), {
      ...baseContext,
      selectedNoteId: null,
    })).toBe('Select a note first.');
    expect(getActionDisabledReason(getElectronAction('close-tab'), {
      ...baseContext,
      openTabCount: 0,
    })).toBe('Open a note tab first.');
    expect(getActionDisabledReason(getElectronAction('close-tabs-to-right'), {
      ...baseContext,
      activePaneTabsToRightCount: 0,
    })).toBe('No tabs to the right in this pane.');
    expect(getActionDisabledReason(getElectronAction('reopen-last-closed-tab'), {
      ...baseContext,
      recentlyClosedTabCount: 0,
    })).toBe('No recently closed note tabs.');
    expect(getActionDisabledReason(getElectronAction('navigate-back'), {
      ...baseContext,
      navigationBackCount: 0,
    })).toBe('No previous note location.');
    expect(getActionDisabledReason(getElectronAction('navigate-forward'), {
      ...baseContext,
      navigationForwardCount: 0,
    })).toBe('No next note location.');
    expect(getActionDisabledReason(getElectronAction('split-pane-right'), {
      ...baseContext,
      paneCount: 2,
    })).toBe('HackDesk supports two note panes in this version.');
    expect(getActionDisabledReason(getElectronAction('move-tab-to-other-pane'), {
      ...baseContext,
      paneCount: 1,
    })).toBe('Split the editor before moving tabs between panes.');
    expect(getActionDisabledReason(getElectronAction('set-editor-mode-standard'), baseContext)).toBe(
      'Standard editor mode is already active.',
    );
    expect(getActionDisabledReason(getElectronAction('set-editor-mode-vim'), baseContext)).toBeNull();
  });

});
