import { describe, expect, it } from 'vitest';

import {
  ELECTRON_ACTIONS,
  getActionDisabledReason,
  getCommandPaletteActions,
  getElectronAction,
  isElectronActionEnabled,
  type ElectronActionContext,
} from './electron-actions';

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
    expect(getElectronAction('export-debug-logs')).toMatchObject({
      label: 'Export Debug Logs',
      menuAccelerator: 'Shift+CmdOrCtrl+L',
    });
    expect(getElectronAction('save-note')).toMatchObject({
      category: 'note',
      shortcut: '⌘S',
      menuAccelerator: 'CmdOrCtrl+S',
    });
  });

  it('uses the same registry for command palette actions', () => {
    expect(getCommandPaletteActions().map((action) => action.id)).toEqual(ELECTRON_ACTIONS.map((action) => action.id));
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
  });
});
