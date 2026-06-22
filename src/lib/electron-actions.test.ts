import { describe, expect, it } from 'vitest';

import {
  ELECTRON_ACTIONS,
  getActionDisabledReason,
  getActionLabel,
  getCommandPaletteActions,
  getElectronAction,
  isElectronActionEnabled,
  type ElectronActionContext,
} from './electron-actions';
import { ELECTRON_MENU_SCHEMA } from './electron-menu-schema';

const baseContext: ElectronActionContext = {
  hasToken: true,
  canCreate: true,
  scopeType: 'personal',
  selectedFolderId: 'folder-1',
  canModifySelectedFolder: true,
  selectedNoteId: 'note-1',
  noteDirty: true,
  isSavingNote: false,
  inspectorCollapsed: false,
  navigatorCollapsed: false,
  workspaceRailCollapsed: false,
  readerMode: 'edit',
};

describe('electron action registry', () => {
  it('keeps action IDs unique and exposes menu shortcuts', () => {
    const ids = ELECTRON_ACTIONS.map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(getElectronAction('new-note')).toMatchObject({
      label: 'New Note',
      menuAccelerator: 'CmdOrCtrl+N',
    });
    expect(getElectronAction('new-folder')).toMatchObject({
      label: 'New Folder',
      menuAccelerator: 'Shift+CmdOrCtrl+N',
    });
    expect(getElectronAction('open-command-palette')).toMatchObject({
      shortcut: '⌘K',
      menuAccelerator: 'CmdOrCtrl+K',
    });
    expect(getElectronAction('toggle-theme')).toMatchObject({
      label: 'Toggle Theme',
      shortcut: '⌘T',
      menuAccelerator: 'CmdOrCtrl+T',
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
    expect(getElectronAction('export-note-markdown')).toMatchObject({
      label: 'Export Note as Markdown',
      menuAccelerator: 'Shift+CmdOrCtrl+E',
    });
    expect(getElectronAction('import-markdown-note')).toMatchObject({
      label: 'Import Markdown Note',
      menuAccelerator: 'Shift+CmdOrCtrl+I',
    });
    expect(getElectronAction('toggle-reader-mode')).toMatchObject({
      label: 'Toggle View Mode',
      category: 'view',
    });
  });

  it('uses the same registry for command palette actions', () => {
    expect(getCommandPaletteActions().map((action) => action.id)).toEqual(ELECTRON_ACTIONS.map((action) => action.id));
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
  });

  it('uses reader mode context for dynamic action labels', () => {
    expect(getActionLabel(getElectronAction('toggle-reader-mode'), {
      ...baseContext,
      readerMode: 'edit',
    })).toBe('Switch to View Mode');
    expect(getActionLabel(getElectronAction('toggle-reader-mode'), {
      ...baseContext,
      readerMode: 'read',
    })).toBe('Switch to Edit Mode');
  });
});
