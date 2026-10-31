import { describe, expect, it } from 'vitest';

import { ELECTRON_ACTIONS, type ElectronActionContext } from './electron-actions';
import { getLeaderLevel, leaderSequences } from './leader-keys';

const actionContext = {
  editorMode: 'standard', hasToken: true, canCreate: true, scopeType: 'personal', selectedFolderId: null,
  canModifySelectedFolder: false, selectedNoteId: 'note-1', activeTabIsDraft: false, noteDirty: false, isSavingNote: false,
  openTabCount: 1, activePaneTabCount: 1, activePaneTabsToLeftCount: 0, activePaneTabsToRightCount: 0,
  navigationBackCount: 0, navigationForwardCount: 0, recentlyClosedTabCount: 0, paneCount: 1, inspectorCollapsed: true,
  navigatorCollapsed: false, bookOpen: false, bookContentsHidden: false, hasLocalVault: false,
  keyHintsVisible: true,
} satisfies ElectronActionContext;
const options = { actionContext, shortcuts: undefined, platform: 'darwin', characterShortcutsEnabled: true };

describe('leader keys', () => {
  it('runs each action from one sequence, none a prefix of another, all real actions', () => {
    const sequences = leaderSequences();
    const ids = new Set(ELECTRON_ACTIONS.map(action => action.id));
    expect(sequences.every(([, id]) => ids.has(id))).toBe(true);
    const keys = sequences.map(([path]) => path.join(' '));
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of keys) for (const b of keys) if (a !== b) expect(b.startsWith(`${a} `)).toBe(false);
    expect(new Set(sequences.map(([, id]) => id)).size).toBe(sequences.length);
  });

  it('lists groups at the top and actions with their own shortcuts inside a group', () => {
    const top = getLeaderLevel([], options)!;
    expect(top.title).toEqual(['Commands']);
    expect(top.items.filter(item => !item.actionId).map(item => `${item.key} ${item.label}`))
      .toEqual(['n Note', 't Tab', 'g Go', 'v View', 'a AI', 'f Folder']);

    const note = getLeaderLevel(['n'], options)!;
    expect(note.title).toEqual(['Commands', 'Note']);
    expect(note.items.find(item => item.key === 'n')).toMatchObject({ label: 'New Note', actionId: 'new-note', shortcut: '⌘N' });
  });

  it('marks unavailable actions with their reason, and labels that depend on state', () => {
    const note = getLeaderLevel(['n'], options)!;
    expect(note.items.find(item => item.key === 's')?.disabledReason).toBe('No unsaved note changes.');
    const view = getLeaderLevel(['v'], { ...options, actionContext: { ...actionContext, keyHintsVisible: false } })!;
    expect(view.items.find(item => item.key === 'k')?.label).toBe('Show Key Hints');
    expect(view.items.find(item => item.key === 'f')).toMatchObject({ actionId: 'toggle-hack-mode', label: 'Enter Hack Mode', shortcut: '⌘.' });
  });

  it('has no level past an action or for an unknown letter', () => {
    expect(getLeaderLevel(['n', 'n'], options)).toBeNull();
    expect(getLeaderLevel(['z'], options)).toBeNull();
  });
});
