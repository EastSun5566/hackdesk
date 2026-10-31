import { describe, expect, it } from 'vitest';

import type { ElectronActionContext } from './electron-actions';
import { getKeyHints } from './key-hints';

const actionContext: ElectronActionContext = {
  editorMode: 'standard',
  hasToken: true,
  canCreate: true,
  scopeType: 'personal',
  selectedFolderId: null,
  canModifySelectedFolder: false,
  selectedNoteId: 'note-1',
  activeTabIsDraft: false,
  noteDirty: false,
  isSavingNote: false,
  openTabCount: 1,
  activePaneTabCount: 1,
  activePaneTabsToLeftCount: 0,
  activePaneTabsToRightCount: 0,
  navigationBackCount: 0,
  navigationForwardCount: 0,
  recentlyClosedTabCount: 0,
  paneCount: 1,
  inspectorCollapsed: true,
  navigatorCollapsed: false,
  workspaceRailCollapsed: false,
  bookOpen: false,
  bookContentsHidden: false,
  hasLocalVault: false,
  keyHintsVisible: true,
};

const hints = (context: Parameters<typeof getKeyHints>[0], options: Partial<Parameters<typeof getKeyHints>[1]> = {}) => getKeyHints(context, {
  actionContext, shortcuts: undefined, platform: 'darwin', characterShortcutsEnabled: true, ...options,
});
const text = (list: ReturnType<typeof getKeyHints>) => list.map(hint => `${hint.keys} ${hint.label}`);

describe('getKeyHints', () => {
  it('lists the most useful keys for each place focus can be', () => {
    expect(text(hints('navigator'))).toEqual(['↑ ↓ Move', '↵ Open', 'Space Commands', '/ Search', '⌘N New note']);
    expect(text(hints('finder'))).toEqual(['Type Filter notes', 'Esc Clear, then back to the tree', 'F6 Next area']);
    expect(text(hints('tabs'))).toEqual(['← → Move', '↵ Select', 'Space Commands', '⌘W Close', '⌘\\ Split right']);
    expect(text(hints('editor'))).toEqual(['⌘J Commands', '⌘K Palette', '⌘P Open note', '⌘F Find']);
    expect(text(hints('workspace'))).toContain('⌘1–9 Jump to workspace');
  });

  it('offers Save only while there is something to save', () => {
    expect(text(hints('editor', { actionContext: { ...actionContext, noteDirty: true } }))).toContain('⌘S Save');
  });

  it('shows custom keys, and leaves out actions with no key or no use here', () => {
    expect(text(hints('editor', { shortcuts: { 'open-quick-open': 'mod+shift+o' } }))).toContain('⇧⌘O Open note');
    expect(text(hints('editor', { shortcuts: { 'find-in-note': 'none' } }))).not.toContain('⌘F Find');
    // Splitting needs a free pane, and closing needs a tab.
    expect(text(hints('tabs', { actionContext: { ...actionContext, paneCount: 2 } }))).not.toContain('⌘\\ Split right');
    expect(text(hints('tabs', { actionContext: { ...actionContext, openTabCount: 0 } }))).not.toContain('⌘W Close');
  });

  it('drops / when character shortcuts are off, and uses Ctrl elsewhere', () => {
    expect(text(hints('navigator', { characterShortcutsEnabled: false }))).not.toContain('/ Search');
    // Without single-key shortcuts, Space types as usual and the leader shortcut opens the menu.
    expect(text(hints('navigator', { characterShortcutsEnabled: false }))).toContain('⌘J Commands');
    expect(text(hints('navigator', { platform: 'win32' }))).toContain('Ctrl+N New note');
  });
});
