import { describe, expect, it } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';

import {
  closeNoteTab,
  closeOtherNoteTabs,
  closeTabsToRight,
  closeTabsByNoteIdentity,
  createEmptyNoteWorkspaceState,
  duplicateActiveNoteTab,
  focusAdjacentTab,
  getActiveTab,
  getActiveNavigationTarget,
  getPaneActiveTab,
  hydrateNoteWorkspaceLayout,
  moveActiveTabToOtherPane,
  navigateNoteWorkspace,
  openNoteTab,
  reopenLastClosedTab,
  selectNoteTab,
  splitActiveTabRight,
  toPersistedNoteWorkspaceLayout,
  updateNoteTabDraft,
} from './note-workspace';

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    id: input.id,
    title: input.title,
    description: '',
    tags: [],
    updatedAtMillis: input.updatedAtMillis ?? null,
    createdAtMillis: null,
    publishedAtMillis: null,
    tagsUpdatedAtMillis: null,
    titleUpdatedAtMillis: null,
    content: input.content ?? null,
    publishLink: `https://hackmd.io/${input.id}`,
    shortId: input.shortId ?? input.id,
    permalink: null,
    teamPath: input.teamPath ?? null,
    userPath: null,
    publishType: 'edit',
    readPermission: 'owner',
    writePermission: 'owner',
    lastChangeUser: null,
    folderPaths: [],
    ...input,
  };
}

describe('note workspace tabs', () => {
  it('opens a note tab and focuses the existing tab for the same note identity', () => {
    const first = note({ id: 'note-1', title: 'Alpha' });
    const state = openNoteTab(createEmptyNoteWorkspaceState('personal'), first);
    const reopened = openNoteTab(state, { ...first, title: 'Alpha Updated' });

    expect(Object.values(reopened.tabs)).toHaveLength(1);
    expect(getActiveTab(reopened)?.title).toBe('Alpha');
  });

  it('treats personal and team notes as different identities', () => {
    const state = [note({ id: 'same', title: 'Personal' }), note({ id: 'same', title: 'Team', teamPath: 'team-a' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('team:team-a'));

    expect(Object.values(state.tabs).map((tab) => tab.title)).toEqual(['Personal', 'Team']);
  });

  it('duplicates the active tab to the right and copies its draft', () => {
    const withTab = openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Alpha' }));
    const activeTabId = getActiveTab(withTab)?.tabId ?? '';
    const withDraft = updateNoteTabDraft(withTab, activeTabId, { title: 'Draft Alpha', content: '# Draft' });
    const duplicated = duplicateActiveNoteTab(withDraft);
    const pane = duplicated.panes[0];
    const duplicateTabId = pane.tabIds[1];

    expect(pane.tabIds).toHaveLength(2);
    expect(pane.activeTabId).toBe(duplicateTabId);
    expect(duplicated.tabs[duplicateTabId]).toMatchObject({ noteId: 'note-1', title: 'Alpha' });
    expect(duplicated.drafts[duplicateTabId]).toEqual({ title: 'Draft Alpha', content: '# Draft' });
  });

  it('splits a single active tab into a second pane without emptying the first pane', () => {
    const state = splitActiveTabRight(openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Alpha' })));

    expect(state.panes).toHaveLength(2);
    expect(state.panes[0].tabIds).toHaveLength(1);
    expect(state.panes[1].tabIds).toHaveLength(1);
    expect(getPaneActiveTab(state, state.panes[0].paneId)?.noteId).toBe('note-1');
    expect(getPaneActiveTab(state, state.panes[1].paneId)?.noteId).toBe('note-1');
  });

  it('moves the active tab to the other pane and removes empty secondary panes after close', () => {
    const withTabs = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const split = splitActiveTabRight(withTabs);
    const moved = moveActiveTabToOtherPane(split);
    const active = getActiveTab(moved);

    expect(active?.noteId).toBe('b');
    expect(moved.panes[0].tabIds).toContain(active?.tabId);

    const closed = closeNoteTab(moved, active?.tabId ?? '');
    expect(closed.panes).toHaveLength(1);
  });

  it('closes other tabs only inside the target pane', () => {
    const withTabs = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const split = splitActiveTabRight(withTabs);
    const targetPaneId = split.panes[0].paneId;
    const withThirdTab = openNoteTab(split, note({ id: 'c', title: 'C' }), targetPaneId);
    const keepTabId = getPaneActiveTab(withThirdTab, targetPaneId)?.tabId ?? '';
    const closed = closeOtherNoteTabs(withThirdTab, targetPaneId, keepTabId);

    expect(Object.values(closed.tabs).map((tab) => tab.title).sort()).toEqual(['B', 'C']);
    expect(closed.panes).toHaveLength(2);
    expect(closed.panes[0].tabIds).toEqual([keepTabId]);
    expect(getPaneActiveTab(closed, closed.panes[1].paneId)?.title).toBe('B');
  });

  it('closes tabs to the right inside the target pane', () => {
    const state = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' }), note({ id: 'c', title: 'C' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const paneId = state.panes[0].paneId;
    const firstTabId = state.panes[0].tabIds[0];
    const closed = closeTabsToRight(state, paneId, firstTabId);

    expect(closed.panes[0].tabIds).toEqual([firstTabId]);
    expect(Object.values(closed.tabs).map((tab) => tab.title)).toEqual(['A']);
    expect(closed.recentlyClosedTabs.map((tab) => tab.title)).toEqual(['C', 'B']);
  });

  it('reopens the last closed tab in the active pane', () => {
    const state = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const closed = closeNoteTab(state, getActiveTab(state)?.tabId ?? '');
    const reopened = reopenLastClosedTab(closed);

    expect(getActiveTab(reopened)?.title).toBe('B');
    expect(Object.values(reopened.tabs).map((tab) => tab.title)).toEqual(['A', 'B']);
    expect(reopened.recentlyClosedTabs).toEqual([]);
  });

  it('closes every tab for a deleted note identity', () => {
    const state = splitActiveTabRight(openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Alpha' })));
    const closedOnce = closeNoteTab(state, state.panes[0].tabIds[0]);
    const closed = closeTabsByNoteIdentity(closedOnce, { id: 'note-1', teamPath: null });

    expect(Object.values(closed.tabs)).toHaveLength(0);
    expect(closed.panes).toHaveLength(1);
    expect(closed.recentlyClosedTabs).toEqual([]);
  });

  it('persists layout without drafts and hydrates valid panes', () => {
    const withTab = openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Alpha' }));
    const tabId = getActiveTab(withTab)?.tabId ?? '';
    const withDraft = updateNoteTabDraft(withTab, tabId, { title: 'Draft', content: 'Body' });
    const persisted = toPersistedNoteWorkspaceLayout(withDraft);
    const hydrated = hydrateNoteWorkspaceLayout('personal', persisted);

    expect(hydrated.drafts).toEqual({});
    expect('backStack' in persisted).toBe(false);
    expect('forwardStack' in persisted).toBe(false);
    expect(hydrated.backStack).toEqual([]);
    expect(hydrated.forwardStack).toEqual([]);
    expect(getActiveTab(hydrated)?.title).toBe('Alpha');
  });

  it('falls back from invalid persisted layouts', () => {
    const hydrated = hydrateNoteWorkspaceLayout('personal', {
      version: 1,
      scopeKey: 'personal',
      tabs: {
        'tab-1': { tabId: 'different', noteId: 'note-1', teamPath: null, title: 'Invalid' },
      },
      panes: [{ paneId: 'pane-1', tabIds: ['missing-tab'], activeTabId: 'missing-tab', size: Number.NaN }],
      activePaneId: 'pane-1',
    });

    expect(Object.values(hydrated.tabs)).toHaveLength(0);
    expect(hydrated.panes).toHaveLength(1);
    expect(hydrated.panes[0]).toMatchObject({ tabIds: [], activeTabId: null, size: 100 });
  });

  it('normalizes corrupted pane sizes on hydrate and resize', () => {
    const withTabs = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const split = splitActiveTabRight(withTabs);
    const hydrated = hydrateNoteWorkspaceLayout('personal', {
      version: 1,
      scopeKey: 'personal',
      tabs: split.tabs,
      panes: [
        { ...split.panes[0], size: -20 },
        { ...split.panes[1], size: 120 },
      ],
      activePaneId: split.activePaneId,
    });

    expect(hydrated.panes.map((pane) => pane.size)).toEqual([10, 90]);
  });

  it('cycles tabs inside the active pane', () => {
    const state = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));

    expect(getActiveTab(state)?.title).toBe('B');
    expect(getActiveTab(focusAdjacentTab(state, 'previous'))?.title).toBe('A');
  });

  it('records the previous active tab when switching tabs', () => {
    const state = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const paneId = state.panes[0].paneId;
    const firstTabId = state.panes[0].tabIds[0];
    const secondTabId = state.panes[0].tabIds[1];
    const selected = selectNoteTab(state, paneId, firstTabId);

    expect(getActiveTab(selected)?.title).toBe('A');
    expect(selected.backStack[0]).toEqual({ paneId, tabId: secondTabId });
    expect(selected.forwardStack).toEqual([]);
  });

  it('navigates back and forward between focused tab locations', () => {
    const opened = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' }), note({ id: 'c', title: 'C' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const paneId = opened.panes[0].paneId;
    const [firstTabId, secondTabId] = opened.panes[0].tabIds;
    const selectedA = selectNoteTab(opened, paneId, firstTabId);
    const selectedB = selectNoteTab(selectedA, paneId, secondTabId);

    const back = navigateNoteWorkspace(selectedB, 'back');
    expect(getActiveTab(back)?.title).toBe('A');
    expect(back.forwardStack[0]).toEqual({ paneId, tabId: secondTabId });

    const forward = navigateNoteWorkspace(back, 'forward');
    expect(getActiveTab(forward)?.title).toBe('B');
    expect(forward.backStack[0]).toEqual({ paneId, tabId: firstTabId });
  });

  it('clears forward navigation after opening a new note from a back location', () => {
    const opened = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const paneId = opened.panes[0].paneId;
    const firstTabId = opened.panes[0].tabIds[0];
    const selected = selectNoteTab(opened, paneId, firstTabId);
    const back = navigateNoteWorkspace(selected, 'back');
    const next = openNoteTab(back, note({ id: 'c', title: 'C' }));

    expect(getActiveTab(next)?.title).toBe('C');
    expect(next.forwardStack).toEqual([]);
  });

  it('skips navigation targets for closed tabs', () => {
    const opened = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' }), note({ id: 'c', title: 'C' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));
    const paneId = opened.panes[0].paneId;
    const [firstTabId, secondTabId, thirdTabId] = opened.panes[0].tabIds;
    const selectedA = selectNoteTab(opened, paneId, firstTabId);
    const selectedB = selectNoteTab(selectedA, paneId, secondTabId);
    const selectedC = selectNoteTab(selectedB, paneId, thirdTabId);
    const closedB = closeNoteTab(selectedC, secondTabId);

    expect(closedB.backStack.every((target) => target.tabId !== secondTabId)).toBe(true);

    const back = navigateNoteWorkspace(closedB, 'back');
    expect(getActiveNavigationTarget(back)).toEqual({ paneId, tabId: firstTabId });
    expect(getActiveTab(back)?.title).toBe('A');
  });
});
