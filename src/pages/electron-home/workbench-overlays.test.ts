import { describe, expect, it } from 'vitest';

import {
  getTopOverlay,
  INITIAL_OVERLAYS,
  isOverlayOpen,
  OVERLAY_CLOSE_ORDER,
  overlaysReducer,
  type OverlayEvent,
  type WorkbenchOverlays,
} from './workbench-overlays';

const run = (events: OverlayEvent[], from = INITIAL_OVERLAYS) => events.reduce<WorkbenchOverlays>(overlaysReducer, from);

/** Closes the top overlay until none in the close order is left, and lists what closed. */
function closeAll(state: WorkbenchOverlays) {
  const closed: string[] = [];
  for (let top = getTopOverlay(state); top; top = getTopOverlay(state)) {
    closed.push(top);
    state = overlaysReducer(state, { type: 'close', key: top });
  }
  return { closed, state };
}

describe('workbench overlays', () => {
  it('closes shortcut help before every dialog, and the History panel after them', () => {
    const state = run([
      { type: 'set', key: 'history', value: true },
      { type: 'open_settings', tab: 'editor' },
      { type: 'set', key: 'palette', value: { mode: 'commands', open: true, search: '' } },
      { type: 'set', key: 'shortcutHelp', value: { region: 'editor', target: null } },
    ]);
    expect(closeAll(state).closed).toEqual(['shortcutHelp', 'palette', 'settings', 'history']);
  });

  it('shows one sidebar panel at a time: opening Trash closes History, and the other way round', () => {
    const trash = run([{ type: 'set', key: 'history', value: true }, { type: 'set', key: 'trash', value: true }]);
    expect([trash.trash, trash.history]).toEqual([true, false]);
    const history = run([{ type: 'set', key: 'history', value: true }], trash);
    expect([history.trash, history.history]).toEqual([false, true]);
    // Closing one leaves the other closed.
    expect(run([{ type: 'set', key: 'history', value: false }], history).trash).toBe(false);
  });

  it('leaves menus and pickers that close themselves to their own handling', () => {
    const state = run([
      { type: 'set', key: 'destination', value: true },
      { type: 'set', key: 'onboarding', value: true },
      { type: 'set', key: 'workspaceSwitcher', value: true },
      { type: 'set', key: 'leaderPath', value: ['g'] },
    ]);
    expect(getTopOverlay(state)).toBeNull();
    for (const key of ['destination', 'onboarding', 'workspaceSwitcher', 'leaderPath'] as const) {
      expect(OVERLAY_CLOSE_ORDER).not.toContain(key);
      expect(isOverlayOpen(state, key)).toBe(true);
    }
  });

  it('clears what an overlay held when it closes, but keeps the Settings tab', () => {
    const state = run([
      { type: 'set', key: 'palette', value: { mode: 'move-note', open: true, search: 'plan' } },
      { type: 'set', key: 'createNote', value: { open: true, title: 'Plan' } },
      { type: 'open_settings', tab: 'shortcuts' },
      { type: 'set', key: 'leaderPath', value: ['g', 'n'] },
    ]);
    const closed = run([
      { type: 'close', key: 'palette' },
      { type: 'close', key: 'createNote' },
      { type: 'close', key: 'settings' },
      { type: 'close', key: 'leaderPath' },
    ], state);
    expect(closed.palette).toEqual(INITIAL_OVERLAYS.palette);
    expect(closed.createNote).toEqual(INITIAL_OVERLAYS.createNote);
    expect(closed.settings).toEqual({ open: false, tab: 'shortcuts' });
    expect(closed.leaderPath).toBeNull();
  });

  it('keeps what a caller sets while closing, so content stays during the exit animation', () => {
    const state = run([{ type: 'set', key: 'createNote', value: { open: false, title: 'Draft title' } }]);
    expect(isOverlayOpen(state, 'createNote')).toBe(false);
    expect(state.createNote.title).toBe('Draft title');
  });

  it('hands New Note\'s location picker back to New Note with its title, however the picker closes', () => {
    const picking = run([
      { type: 'set', key: 'createNote', value: { open: false, title: 'Weekly plan' } },
      { type: 'set', key: 'palette', value: { mode: 'choose-note-folder', open: true, search: '', target: { type: 'create', title: 'Weekly plan' } } },
    ]);
    // A folder picked: the palette closes itself.
    const picked = overlaysReducer(picking, { type: 'set', key: 'palette', value: { mode: 'commands', open: false, search: '' } });
    expect(picked.createNote).toEqual({ open: true, title: 'Weekly plan' });
    // Escape on the workbench closes the top overlay.
    expect(overlaysReducer(picking, { type: 'close', key: 'palette' }).createNote).toEqual({ open: true, title: 'Weekly plan' });
    // Typing in the picker keeps it, and its target, open.
    const typed = overlaysReducer(picking, { type: 'set', key: 'palette', value: { ...picking.palette, search: 'pro' } });
    expect(typed.createNote.open).toBe(false);
    expect(typed.palette.target).toEqual({ type: 'create', title: 'Weekly plan' });
  });

  it('opens nothing else when a move picker closes', () => {
    const moving = run([{ type: 'set', key: 'palette', value: { mode: 'move-folder', open: true, search: '', target: { type: 'folder', id: 'folder-1' } } }]);
    const closed = overlaysReducer(moving, { type: 'close', key: 'palette' });
    expect(closed.palette).toEqual(INITIAL_OVERLAYS.palette);
    expect(closed.createNote).toEqual(INITIAL_OVERLAYS.createNote);
  });

  it('opens Settings on the tab asked for', () => {
    expect(run([{ type: 'open_settings', tab: 'vault' }]).settings).toEqual({ open: true, tab: 'vault' });
  });

  it('returns the same state when an event changes nothing', () => {
    const state = run([{ type: 'set', key: 'trash', value: true }]);
    expect(overlaysReducer(state, { type: 'set', key: 'trash', value: true })).toBe(state);
    expect(overlaysReducer(state, { type: 'close', key: 'history' })).toBe(state);
    expect(overlaysReducer(INITIAL_OVERLAYS, { type: 'close', key: 'deleteNote' })).toBe(INITIAL_OVERLAYS);
  });

  it('treats an empty leader path as an open leader menu', () => {
    expect(isOverlayOpen(run([{ type: 'set', key: 'leaderPath', value: [] }]), 'leaderPath')).toBe(true);
    expect(isOverlayOpen(INITIAL_OVERLAYS, 'leaderPath')).toBe(false);
  });
});
