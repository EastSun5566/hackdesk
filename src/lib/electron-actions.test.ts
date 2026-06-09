import { describe, expect, it } from 'vitest';

import { ELECTRON_ACTIONS, getCommandPaletteActions, getElectronAction } from './electron-actions';

describe('electron action registry', () => {
  it('keeps action IDs unique and exposes menu shortcuts', () => {
    const ids = ELECTRON_ACTIONS.map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(getElectronAction('new-note')).toMatchObject({
      label: 'New Note',
      menuAccelerator: 'CmdOrCtrl+N',
    });
    expect(getElectronAction('open-command-palette')).toMatchObject({
      shortcut: '⌘K',
      menuAccelerator: 'CmdOrCtrl+K',
    });
  });

  it('uses the same registry for command palette actions', () => {
    expect(getCommandPaletteActions().map((action) => action.id)).toEqual(ELECTRON_ACTIONS.map((action) => action.id));
  });
});
