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
  isDraftNoteTab,
  hydrateNoteWorkspaceLayout,
  materializeDraftNoteTab,
  moveActiveTabToOtherPane,
  navigateNoteWorkspace,
  openDraftNoteTab,
  openNoteTab,
  reopenLastClosedTab,
  reorderNoteTab,
  reconcileSavedNoteTab,
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

  it('opens a local-only draft tab without deduping real note identities', () => {
    const withDraft = openDraftNoteTab(createEmptyNoteWorkspaceState('personal'));
    const draft = getActiveTab(withDraft);
    const withNote = openNoteTab(withDraft, note({ id: 'note-1', title: 'Alpha' }));

    expect(isDraftNoteTab(draft)).toBe(true);
    expect(draft?.title).toBe('Untitled');
    expect(withDraft.drafts[draft?.tabId ?? '']).toEqual({ title: 'Untitled', content: '' });
    expect(Object.values(withNote.tabs)).toHaveLength(2);
  });

  it('opens a draft tab with initial captured content', () => {
    const withDraft = openDraftNoteTab(createEmptyNoteWorkspaceState('personal'), {
      content: '# Captured\nBody',
    });
    const draft = getActiveTab(withDraft);

    expect(isDraftNoteTab(draft)).toBe(true);
    expect(withDraft.drafts[draft?.tabId ?? '']).toEqual({
      title: 'Untitled',
      content: '# Captured\nBody',
    });
  });

  it('materializes a draft tab into a saved note in place and clears its draft', () => {
    const withDraft = openDraftNoteTab(createEmptyNoteWorkspaceState('personal'));
    const draftTabId = getActiveTab(withDraft)?.tabId ?? '';
    const withContent = updateNoteTabDraft(withDraft, draftTabId, { title: 'Draft title', content: 'Body' });
    const materialized = materializeDraftNoteTab(withContent, draftTabId, note({ id: 'note-1', title: 'Saved title' }));

    expect(materialized.tabs[draftTabId]).toMatchObject({
      noteId: 'note-1',
      title: 'Saved title',
      teamPath: null,
    });
    expect(materialized.drafts[draftTabId]).toBeUndefined();
    expect(getActiveTab(materialized)?.tabId).toBe(draftTabId);
  });

  it('does not persist unsaved draft tabs without content persistence', () => {
    const withDraft = openDraftNoteTab(createEmptyNoteWorkspaceState('personal'));
    const persisted = toPersistedNoteWorkspaceLayout(withDraft);
    const hydrated = hydrateNoteWorkspaceLayout('personal', persisted);

    expect(Object.values(persisted.tabs)).toHaveLength(0);
    expect(Object.values(hydrated.tabs)).toHaveLength(0);
    expect(hydrated.panes[0]).toMatchObject({ tabIds: [], activeTabId: null });
  });

  it('persists only meaningful provisional drafts in schema version 2', () => {
    const withDraft = openDraftNoteTab(createEmptyNoteWorkspaceState('personal'), { content: 'Recover me' });
    const persisted = toPersistedNoteWorkspaceLayout(withDraft);
    const hydrated = hydrateNoteWorkspaceLayout('personal', persisted);
    const tab = getActiveTab(hydrated);

    expect(persisted.version).toBe(2);
    expect(isDraftNoteTab(tab)).toBe(true);
    expect(hydrated.drafts[tab?.tabId ?? '']?.content).toBe('Recover me');
  });

  it('clears only the submitted tab when its draft is unchanged', () => {
    const saved = note({ id: 'note-1', title: 'Alpha', content: 'Base' });
    const first = openNoteTab(createEmptyNoteWorkspaceState('personal'), saved);
    const duplicated = duplicateActiveNoteTab(first);
    const [firstTabId, secondTabId] = duplicated.panes[0].tabIds;
    const withDrafts = updateNoteTabDraft(
      updateNoteTabDraft(duplicated, firstTabId, { title: 'Alpha', content: 'Saved edit' }),
      secondTabId,
      { title: 'Alpha', content: 'Other tab edit' },
    );
    const reconciled = reconcileSavedNoteTab(withDrafts, {
      tabId: firstTabId,
      submittedDraft: { title: 'Alpha', content: 'Saved edit' },
      note: { ...saved, content: 'Saved edit' },
    });

    expect(reconciled.drafts[firstTabId]).toBeUndefined();
    expect(reconciled.drafts[secondTabId]?.content).toBe('Other tab edit');
  });

  it('keeps newer typing and rebases it after an in-flight save succeeds', () => {
    const saved = note({ id: 'note-1', title: 'Alpha', content: 'Base' });
    const opened = openNoteTab(createEmptyNoteWorkspaceState('local'), saved);
    const tabId = getActiveTab(opened)?.tabId ?? '';
    const typingContinued = updateNoteTabDraft(opened, tabId, { title: 'Alpha', content: 'Newer text' });
    const reconciled = reconcileSavedNoteTab(typingContinued, {
      tabId,
      submittedDraft: { title: 'Alpha', content: 'Submitted text' },
      note: { ...saved, content: 'Submitted text', localRevision: { contentHash: 'saved-hash', mtimeMs: 10 } } as NoteSummary,
    });

    expect(reconciled.drafts[tabId]).toMatchObject({
      content: 'Newer text',
      baseContent: 'Submitted text',
      baseRevision: { contentHash: 'saved-hash', mtimeMs: 10 },
    });
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

  it('persists existing-note edits and hydrates valid panes', () => {
    const withTab = openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Alpha' }));
    const tabId = getActiveTab(withTab)?.tabId ?? '';
    const withDraft = updateNoteTabDraft(withTab, tabId, { title: 'Draft', content: 'Body' });
    const persisted = toPersistedNoteWorkspaceLayout(withDraft);
    const hydrated = hydrateNoteWorkspaceLayout('personal', persisted);

    expect(hydrated.drafts[tabId]).toEqual({ title: 'Draft', content: 'Body' });
    expect('backStack' in persisted).toBe(false);
    expect('forwardStack' in persisted).toBe(false);
    expect(hydrated.backStack).toEqual([]);
    expect(hydrated.forwardStack).toEqual([]);
    expect(getActiveTab(hydrated)?.title).toBe('Alpha');
  });

  it.each(['personal', 'team:team-a', 'local:vault-A'])('restores edited titles, empty content and baseline in %s', (scopeKey) => {
    const state = openNoteTab(createEmptyNoteWorkspaceState(scopeKey), note({ id: 'note-1', title: 'Original' }));
    const tabId = getActiveTab(state)!.tabId;
    const draft = { title: 'Renamed', content: '', baseTitle: 'Original', baseContent: 'Original body', baseRevision: { contentHash: 'hash', mtimeMs: 1 } };
    const restored = hydrateNoteWorkspaceLayout(scopeKey, JSON.parse(JSON.stringify(toPersistedNoteWorkspaceLayout(updateNoteTabDraft(state, tabId, draft)))));
    expect(restored.drafts[tabId]).toEqual(draft);
    expect(restored.tabs).toEqual(state.tabs);
    expect(restored.panes).toEqual(state.panes);
  });

  it('does not persist reverted edits or edits cleared after a successful save', () => {
    const state = openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Original' }));
    const tabId = getActiveTab(state)!.tabId;
    const draft = { title: 'Original', content: 'Changed', baseTitle: 'Original', baseContent: 'Base' };
    const edited = updateNoteTabDraft(state, tabId, draft);
    const saved = reconcileSavedNoteTab(edited, { tabId, submittedDraft: draft, note: note({ id: 'note-1', title: 'Original', content: 'Changed' }) });
    expect(toPersistedNoteWorkspaceLayout(saved).drafts).toEqual({});
    expect(toPersistedNoteWorkspaceLayout(updateNoteTabDraft(state, tabId, { ...draft, content: 'Base' })).drafts).toEqual({});
  });

  it('restores draft text but drops malformed baseline metadata and orphan drafts', () => {
    const state = openNoteTab(createEmptyNoteWorkspaceState('personal'), note({ id: 'note-1', title: 'Original' }));
    const tabId = getActiveTab(state)!.tabId;
    const layout = toPersistedNoteWorkspaceLayout(state);
    const restored = hydrateNoteWorkspaceLayout('personal', { ...layout, drafts: {
      [tabId]: { title: 'Edit', content: 'Keep this', baseContent: 5, baseRevision: { contentHash: 'hash', mtimeMs: 'bad' } },
      orphan: { title: 'Orphan', content: 'Orphan' },
    } });
    expect(restored.drafts).toEqual({ [tabId]: { title: 'Edit', content: 'Keep this' } });
    expect(hydrateNoteWorkspaceLayout('personal', { ...layout, version: 1 }).drafts).toEqual({});
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


describe('pane tab order', () => {
  function fixture() {
    let state = createEmptyNoteWorkspaceState('personal');
    state = openNoteTab(state, note({ id: 'a', title: 'Alpha' }));
    state = openNoteTab(state, note({ id: 'b', title: 'Beta' }));
    state = openDraftNoteTab(state, { title: 'Draft', content: 'Unsaved content' });
    state = splitActiveTabRight(state);
    state = openNoteTab(state, note({ id: 'c', title: 'Gamma' }), state.panes[0].paneId);
    return state;
  }

  it('only reorders the target pane, preserving drafts, selection and history', () => {
    const state = fixture();
    const pane = state.panes[0];
    const [first, second, third] = pane.tabIds;
    const next = reorderNoteTab(state, pane.paneId, first, third);
    expect(next.panes[0].tabIds).toEqual([second, third, first]);
    expect(next.panes[0].activeTabId).toBe(pane.activeTabId);
    expect(next.panes[1]).toBe(state.panes[1]);
    for (const key of ['tabs', 'drafts', 'backStack', 'forwardStack', 'recentlyClosedTabs', 'activePaneId'] as const) {
      expect(next[key]).toBe(state[key]);
    }
    expect(reorderNoteTab(next, pane.paneId, first, second).panes[0].tabIds).toEqual(pane.tabIds);
  });

  it('ignores missing, foreign and identical IDs', () => {
    const state = fixture();
    const pane = state.panes[0];
    const first = pane.tabIds[0];
    for (const [paneId, from, to] of [
      ['missing', first, pane.tabIds[1]],
      [pane.paneId, 'missing', first],
      [pane.paneId, first, 'missing'],
      [pane.paneId, first, state.panes[1].tabIds[0]],
      [pane.paneId, first, first],
    ]) expect(reorderNoteTab(state, paneId, from, to)).toBe(state);
  });

  it('restores order and keeps next-tab and close-right actions consistent', () => {
    const state = fixture();
    const pane = state.panes[0];
    const reordered = reorderNoteTab(state, pane.paneId, pane.tabIds[0], pane.tabIds[2]);
    const restored = hydrateNoteWorkspaceLayout(state.scopeKey, toPersistedNoteWorkspaceLayout(reordered));
    expect(restored.panes.map(p => p.tabIds)).toEqual(reordered.panes.map(p => p.tabIds));
    expect(restored.drafts).toEqual(state.drafts);
    const selected = selectNoteTab(restored, pane.paneId, reordered.panes[0].tabIds[0]);
    expect(getActiveTab(focusAdjacentTab(selected, 'next'))?.tabId).toBe(reordered.panes[0].tabIds[1]);
    const closed = closeTabsToRight(selected, pane.paneId, reordered.panes[0].tabIds[1]);
    expect(closed.panes[0].tabIds).toEqual(reordered.panes[0].tabIds.slice(0, 2));
  });
});
