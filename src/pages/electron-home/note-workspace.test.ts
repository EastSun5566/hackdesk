import { describe, expect, it } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';

import {
  closeNoteTab,
  closeOtherNoteTabs,
  closeTabsByNoteIdentity,
  createEmptyNoteWorkspaceState,
  focusAdjacentTab,
  getActiveTab,
  getPaneActiveTab,
  hydrateNoteWorkspaceLayout,
  moveActiveTabToOtherPane,
  openNoteTab,
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

  it('closes every tab for a deleted note identity', () => {
    const state = splitActiveTabRight(openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Alpha' })));
    const closed = closeTabsByNoteIdentity(state, { id: 'note-1', teamPath: null });

    expect(Object.values(closed.tabs)).toHaveLength(0);
    expect(closed.panes).toHaveLength(1);
  });

  it('persists layout without drafts and hydrates valid panes', () => {
    const withTab = openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Alpha' }));
    const tabId = getActiveTab(withTab)?.tabId ?? '';
    const withDraft = updateNoteTabDraft(withTab, tabId, { title: 'Draft', content: 'Body' });
    const persisted = toPersistedNoteWorkspaceLayout(withDraft);
    const hydrated = hydrateNoteWorkspaceLayout('personal', persisted);

    expect(hydrated.drafts).toEqual({});
    expect(getActiveTab(hydrated)?.title).toBe('Alpha');
  });

  it('cycles tabs inside the active pane', () => {
    const state = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })]
      .reduce((current, item) => openNoteTab(current, item), createEmptyNoteWorkspaceState('personal'));

    expect(getActiveTab(state)?.title).toBe('B');
    expect(getActiveTab(focusAdjacentTab(state, 'previous'))?.title).toBe('A');
  });
});
