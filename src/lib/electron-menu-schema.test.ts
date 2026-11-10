import { describe, expect, it } from 'vitest';

import { ELECTRON_ACTIONS } from './electron-actions';
import { ELECTRON_MENU_SCHEMA } from './electron-menu-schema';

const KNOWN_ACTION_IDS = new Set(ELECTRON_ACTIONS.map((action) => action.id));

describe('electron menu schema', () => {
  it('references only real actions, without duplicates', () => {
    const seen = new Set<string>();

    for (const section of ELECTRON_MENU_SCHEMA) {
      for (const item of section.items) {
        if (item.type !== 'action') continue;
        expect(KNOWN_ACTION_IDS.has(item.actionId), `unknown action ${item.actionId}`).toBe(true);
        expect(seen.has(item.actionId), `duplicate action ${item.actionId}`).toBe(false);
        seen.add(item.actionId);
      }
    }
  });

  it('keeps the File menu bounded; note actions live in the Note menu', () => {
    const file = ELECTRON_MENU_SCHEMA.find((section) => section.id === 'file');
    const note = ELECTRON_MENU_SCHEMA.find((section) => section.id === 'note');

    expect(file).toBeDefined();
    expect(note).toBeDefined();
    // A growing File menu buries everything: new note-level commands go in Note.
    expect(file!.items.length).toBeLessThanOrEqual(18);

    const fileActions = new Set(
      file!.items.filter((item) => item.type === 'action').map((item) => item.actionId),
    );
    for (const noteItem of note!.items) {
      if (noteItem.type !== 'action') continue;
      expect(fileActions.has(noteItem.actionId), `${noteItem.actionId} is in both File and Note`).toBe(false);
    }
  });
});
