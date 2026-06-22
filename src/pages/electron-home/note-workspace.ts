import type { NoteSummary } from '@/lib/electron-api';

export type NoteIdentity = Pick<NoteSummary, 'id' | 'teamPath'>;

export type OpenNoteTab = {
  tabId: string;
  noteId: string;
  teamPath: string | null;
  title: string;
  shortId: string | null;
  updatedAtMillis: number | null;
};

export type NotePane = {
  paneId: string;
  tabIds: string[];
  activeTabId: string | null;
  size: number;
};

export type NoteDocumentDraft = {
  title: string;
  content: string;
  baseTitle?: string;
  baseContent?: string;
};

export type NoteWorkspaceState = {
  version: 1;
  scopeKey: string;
  tabs: Record<string, OpenNoteTab>;
  panes: NotePane[];
  activePaneId: string;
  drafts: Record<string, NoteDocumentDraft>;
  recentlyClosedTabs: OpenNoteTab[];
};

export type PersistedNoteWorkspaceLayout = Pick<
  NoteWorkspaceState,
  'version' | 'scopeKey' | 'tabs' | 'panes' | 'activePaneId'
>;

const NOTE_WORKSPACE_LAYOUT_PREFIX = 'hackdesk_note_workspace:';
const MAX_PANES = 2;
const MAX_RECENTLY_CLOSED_TABS = 10;
const MIN_PANE_SIZE = 10;
const MAX_PANE_SIZE = 90;

let nextTabId = 0;
let nextPaneId = 0;

function createTabId() {
  nextTabId += 1;
  return `note-tab-${Date.now()}-${nextTabId}`;
}

function createPaneId() {
  nextPaneId += 1;
  return `note-pane-${Date.now()}-${nextPaneId}`;
}

export function getNoteIdentityKey(note: NoteIdentity) {
  return `${note.teamPath ?? 'personal'}:${note.id}`;
}

export function noteIdentityMatches(
  left: NoteIdentity | undefined | null,
  right: NoteIdentity | undefined | null,
) {
  return Boolean(left && right && left.id === right.id && (left.teamPath ?? null) === (right.teamPath ?? null));
}

function createInitialPane(paneId = createPaneId()): NotePane {
  return {
    paneId,
    tabIds: [],
    activeTabId: null,
    size: 100,
  };
}

export function createEmptyNoteWorkspaceState(scopeKey: string): NoteWorkspaceState {
  const pane = createInitialPane('note-pane-primary');
  return {
    version: 1,
    scopeKey,
    tabs: {},
    panes: [pane],
    activePaneId: pane.paneId,
    drafts: {},
    recentlyClosedTabs: [],
  };
}

function getActivePane(state: NoteWorkspaceState) {
  return state.panes.find((pane) => pane.paneId === state.activePaneId) ?? state.panes[0];
}

export function getActiveTab(state: NoteWorkspaceState) {
  const pane = getActivePane(state);
  return pane?.activeTabId ? state.tabs[pane.activeTabId] ?? null : null;
}

export function getPaneActiveTab(state: NoteWorkspaceState, paneId: string) {
  const pane = state.panes.find((candidate) => candidate.paneId === paneId);
  return pane?.activeTabId ? state.tabs[pane.activeTabId] ?? null : null;
}

export function getVisibleActiveTabs(state: NoteWorkspaceState) {
  const seen = new Set<string>();
  const tabs: OpenNoteTab[] = [];

  for (const pane of state.panes.slice(0, MAX_PANES)) {
    if (!pane.activeTabId || seen.has(pane.activeTabId)) {
      continue;
    }

    const tab = state.tabs[pane.activeTabId];
    if (tab) {
      tabs.push(tab);
      seen.add(tab.tabId);
    }
  }

  return tabs;
}

export function getTabByNoteIdentity(state: NoteWorkspaceState, note: NoteIdentity) {
  const identityKey = getNoteIdentityKey(note);
  return Object.values(state.tabs).find((tab) => getNoteIdentityKey({ id: tab.noteId, teamPath: tab.teamPath }) === identityKey) ?? null;
}

export function getTabPane(state: NoteWorkspaceState, tabId: string) {
  return state.panes.find((pane) => pane.tabIds.includes(tabId)) ?? null;
}

function getTabTitle(note: Pick<NoteSummary, 'title'>) {
  return note.title.trim() || 'Untitled';
}

function createTab(note: NoteSummary): OpenNoteTab {
  return {
    tabId: createTabId(),
    noteId: note.id,
    teamPath: note.teamPath ?? null,
    title: getTabTitle(note),
    shortId: note.shortId || null,
    updatedAtMillis: note.updatedAtMillis,
  };
}

function normalizePanes(state: NoteWorkspaceState): NotePane[] {
  const tabs = state.tabs;
  const inputPanes = state.panes.slice(0, MAX_PANES);
  const panes = inputPanes.map((pane) => {
    const tabIds = pane.tabIds.filter((tabId, index, ids) => tabs[tabId] && ids.indexOf(tabId) === index);
    const activeTabId = pane.activeTabId && tabIds.includes(pane.activeTabId)
      ? pane.activeTabId
      : tabIds[0] ?? null;
    return { ...pane, size: normalizePaneSize(pane.size, inputPanes.length), tabIds, activeTabId };
  });

  return panes.length > 0 ? panes : [createInitialPane('note-pane-primary')];
}

function normalizePaneSize(size: number, paneCount: number) {
  if (paneCount <= 1) {
    return 100;
  }

  return Number.isFinite(size)
    ? Math.min(Math.max(size, MIN_PANE_SIZE), MAX_PANE_SIZE)
    : 50;
}

function normalizeState(state: NoteWorkspaceState): NoteWorkspaceState {
  const panes = normalizePanes(state);
  const activePaneId = panes.some((pane) => pane.paneId === state.activePaneId)
    ? state.activePaneId
    : panes[0].paneId;
  const tabIds = new Set(Object.keys(state.tabs));
  const drafts = Object.fromEntries(
    Object.entries(state.drafts).filter(([tabId]) => tabIds.has(tabId)),
  );

  return { ...state, panes, activePaneId, drafts };
}

function pushRecentlyClosedTab(state: NoteWorkspaceState, tab: OpenNoteTab) {
  const identityKey = getNoteIdentityKey({ id: tab.noteId, teamPath: tab.teamPath });
  return [
    tab,
    ...state.recentlyClosedTabs.filter((candidate) => (
      getNoteIdentityKey({ id: candidate.noteId, teamPath: candidate.teamPath }) !== identityKey
    )),
  ].slice(0, MAX_RECENTLY_CLOSED_TABS);
}

export function openNoteTab(state: NoteWorkspaceState, note: NoteSummary, paneId = state.activePaneId) {
  const existingTab = getTabByNoteIdentity(state, note);
  if (existingTab) {
    const pane = getTabPane(state, existingTab.tabId) ?? getActivePane(state);
    return selectNoteTab(state, pane.paneId, existingTab.tabId);
  }

  const pane = state.panes.find((candidate) => candidate.paneId === paneId) ?? getActivePane(state);
  const tab = createTab(note);
  return normalizeState({
    ...state,
    tabs: {
      ...state.tabs,
      [tab.tabId]: tab,
    },
    panes: state.panes.map((candidate) => candidate.paneId === pane.paneId
      ? {
        ...candidate,
        tabIds: [...candidate.tabIds, tab.tabId],
        activeTabId: tab.tabId,
      }
      : candidate),
    activePaneId: pane.paneId,
  });
}

export function selectNoteTab(state: NoteWorkspaceState, paneId: string, tabId: string) {
  if (!state.tabs[tabId]) {
    return state;
  }

  return normalizeState({
    ...state,
    panes: state.panes.map((pane) => pane.paneId === paneId && pane.tabIds.includes(tabId)
      ? { ...pane, activeTabId: tabId }
      : pane),
    activePaneId: paneId,
  });
}

export function focusNotePane(state: NoteWorkspaceState, paneId: string) {
  return state.panes.some((pane) => pane.paneId === paneId)
    ? { ...state, activePaneId: paneId }
    : state;
}

export function closeNoteTab(state: NoteWorkspaceState, tabId: string) {
  if (!state.tabs[tabId]) {
    return state;
  }

  const tabs = { ...state.tabs };
  const closedTab = tabs[tabId];
  delete tabs[tabId];
  const drafts = { ...state.drafts };
  delete drafts[tabId];

  const panes = state.panes.map((pane) => {
    if (!pane.tabIds.includes(tabId)) {
      return pane;
    }

    const closedIndex = pane.tabIds.indexOf(tabId);
    const tabIds = pane.tabIds.filter((candidate) => candidate !== tabId);
    const nextActiveTabId = pane.activeTabId === tabId
      ? tabIds[Math.min(closedIndex, tabIds.length - 1)] ?? null
      : pane.activeTabId;
    return { ...pane, tabIds, activeTabId: nextActiveTabId };
  }).filter((pane, index) => pane.tabIds.length > 0 || index === 0);

  return normalizeState({
    ...state,
    tabs,
    drafts,
    panes,
    recentlyClosedTabs: pushRecentlyClosedTab(state, closedTab),
  });
}

export function closeOtherNoteTabs(state: NoteWorkspaceState, paneId: string, keepTabId: string) {
  const targetPane = state.panes.find((pane) => pane.paneId === paneId);
  if (!state.tabs[keepTabId] || !targetPane?.tabIds.includes(keepTabId)) {
    return state;
  }

  const closingTabIds = new Set(targetPane.tabIds.filter((tabId) => tabId !== keepTabId));
  const recentlyClosedTabs = targetPane.tabIds
    .filter((tabId) => closingTabIds.has(tabId))
    .map((tabId) => state.tabs[tabId])
    .filter((tab): tab is OpenNoteTab => Boolean(tab))
    .reduce((nextRecentlyClosedTabs, tab) => pushRecentlyClosedTab({ ...state, recentlyClosedTabs: nextRecentlyClosedTabs }, tab), state.recentlyClosedTabs);
  const tabs = Object.fromEntries(
    Object.entries(state.tabs).filter(([tabId]) => !closingTabIds.has(tabId)),
  );
  const drafts = Object.fromEntries(
    Object.entries(state.drafts).filter(([tabId]) => !closingTabIds.has(tabId)),
  );

  return normalizeState({
    ...state,
    tabs,
    panes: state.panes.map((pane) => pane.paneId === paneId
      ? { ...pane, tabIds: [keepTabId], activeTabId: keepTabId }
      : pane),
    activePaneId: paneId,
    drafts,
    recentlyClosedTabs,
  });
}

export function closeTabsToRight(state: NoteWorkspaceState, paneId: string, tabId: string) {
  const targetPane = state.panes.find((pane) => pane.paneId === paneId);
  const tabIndex = targetPane?.tabIds.indexOf(tabId) ?? -1;
  if (!targetPane || tabIndex < 0) {
    return state;
  }

  const closingTabIds = new Set(targetPane.tabIds.slice(tabIndex + 1));
  if (closingTabIds.size === 0) {
    return state;
  }

  const recentlyClosedTabs = targetPane.tabIds
    .filter((candidate) => closingTabIds.has(candidate))
    .map((candidate) => state.tabs[candidate])
    .filter((tab): tab is OpenNoteTab => Boolean(tab))
    .reduce((nextRecentlyClosedTabs, tab) => pushRecentlyClosedTab({ ...state, recentlyClosedTabs: nextRecentlyClosedTabs }, tab), state.recentlyClosedTabs);
  const tabs = Object.fromEntries(
    Object.entries(state.tabs).filter(([candidate]) => !closingTabIds.has(candidate)),
  );
  const drafts = Object.fromEntries(
    Object.entries(state.drafts).filter(([candidate]) => !closingTabIds.has(candidate)),
  );

  return normalizeState({
    ...state,
    tabs,
    panes: state.panes.map((pane) => pane.paneId === paneId
      ? { ...pane, tabIds: pane.tabIds.filter((candidate) => !closingTabIds.has(candidate)) }
      : pane),
    drafts,
    recentlyClosedTabs,
  });
}

export function closeTabsByNoteIdentity(state: NoteWorkspaceState, note: NoteIdentity) {
  const identityKey = getNoteIdentityKey(note);
  const closed = Object.values(state.tabs)
    .filter((tab) => getNoteIdentityKey({ id: tab.noteId, teamPath: tab.teamPath }) === identityKey)
    .reduce((nextState, tab) => closeNoteTab(nextState, tab.tabId), state);
  return {
    ...closed,
    recentlyClosedTabs: closed.recentlyClosedTabs.filter((tab) => (
      getNoteIdentityKey({ id: tab.noteId, teamPath: tab.teamPath }) !== identityKey
    )),
  };
}

export function reopenLastClosedTab(state: NoteWorkspaceState) {
  const [lastClosedTab, ...remainingClosedTabs] = state.recentlyClosedTabs;
  if (!lastClosedTab) {
    return state;
  }

  const pane = getActivePane(state);
  const reopenedTab = { ...lastClosedTab, tabId: createTabId() };
  return normalizeState({
    ...state,
    tabs: {
      ...state.tabs,
      [reopenedTab.tabId]: reopenedTab,
    },
    panes: state.panes.map((candidate) => candidate.paneId === pane.paneId
      ? {
        ...candidate,
        tabIds: [...candidate.tabIds, reopenedTab.tabId],
        activeTabId: reopenedTab.tabId,
      }
      : candidate),
    activePaneId: pane.paneId,
    recentlyClosedTabs: remainingClosedTabs,
  });
}

export function splitActiveTabRight(state: NoteWorkspaceState) {
  const activePane = getActivePane(state);
  const activeTabId = activePane?.activeTabId;
  if (!activePane || !activeTabId || state.panes.length >= MAX_PANES) {
    return state;
  }

  const nextPane = createInitialPane();
  if (activePane.tabIds.length === 1) {
    const sourceTab = state.tabs[activeTabId];
    const clonedTab = { ...sourceTab, tabId: createTabId() };
    return normalizeState({
      ...state,
      tabs: {
        ...state.tabs,
        [clonedTab.tabId]: clonedTab,
      },
      drafts: state.drafts[activeTabId]
        ? { ...state.drafts, [clonedTab.tabId]: state.drafts[activeTabId] }
        : state.drafts,
      panes: [
        ...state.panes.map((pane) => pane.paneId === activePane.paneId ? { ...pane, size: 50 } : pane),
        {
          ...nextPane,
          tabIds: [clonedTab.tabId],
          activeTabId: clonedTab.tabId,
          size: 50,
        },
      ],
      activePaneId: nextPane.paneId,
    });
  }

  return normalizeState({
    ...state,
    panes: [
      ...state.panes.map((pane) => pane.paneId === activePane.paneId
        ? { ...pane, tabIds: pane.tabIds.filter((tabId) => tabId !== activeTabId), size: 50 }
        : pane),
      {
        ...nextPane,
        tabIds: [activeTabId],
        activeTabId,
        size: 50,
      },
    ],
    activePaneId: nextPane.paneId,
  });
}

export function moveActiveTabToOtherPane(state: NoteWorkspaceState) {
  const activePane = getActivePane(state);
  const activeTabId = activePane?.activeTabId;
  const targetPane = state.panes.find((pane) => pane.paneId !== activePane?.paneId);
  if (!activePane || !activeTabId || !targetPane) {
    return state;
  }

  return normalizeState({
    ...state,
    panes: state.panes.map((pane) => {
      if (pane.paneId === activePane.paneId) {
        return { ...pane, tabIds: pane.tabIds.filter((tabId) => tabId !== activeTabId) };
      }

      if (pane.paneId === targetPane.paneId) {
        return {
          ...pane,
          tabIds: pane.tabIds.includes(activeTabId) ? pane.tabIds : [...pane.tabIds, activeTabId],
          activeTabId,
        };
      }

      return pane;
    }),
    activePaneId: targetPane.paneId,
  });
}

export function resizeNotePanes(state: NoteWorkspaceState, sizes: Record<string, number>) {
  return normalizeState({
    ...state,
    panes: state.panes.map((pane) => ({
      ...pane,
      size: Number.isFinite(sizes[pane.paneId]) ? normalizePaneSize(sizes[pane.paneId], state.panes.length) : pane.size,
    })),
  });
}

export function focusAdjacentPane(state: NoteWorkspaceState, direction: 'next' | 'previous') {
  if (state.panes.length <= 1) {
    return state;
  }

  const currentIndex = Math.max(0, state.panes.findIndex((pane) => pane.paneId === state.activePaneId));
  const nextIndex = direction === 'next'
    ? (currentIndex + 1) % state.panes.length
    : (currentIndex - 1 + state.panes.length) % state.panes.length;

  return { ...state, activePaneId: state.panes[nextIndex].paneId };
}

export function focusAdjacentTab(state: NoteWorkspaceState, direction: 'next' | 'previous') {
  const pane = getActivePane(state);
  if (!pane || pane.tabIds.length <= 1) {
    return state;
  }

  const currentIndex = pane.activeTabId ? pane.tabIds.indexOf(pane.activeTabId) : 0;
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = direction === 'next'
    ? (safeIndex + 1) % pane.tabIds.length
    : (safeIndex - 1 + pane.tabIds.length) % pane.tabIds.length;

  return selectNoteTab(state, pane.paneId, pane.tabIds[nextIndex]);
}

export function updateNoteTabDraft(state: NoteWorkspaceState, tabId: string, draft: NoteDocumentDraft) {
  if (!state.tabs[tabId]) {
    return state;
  }

  return {
    ...state,
    drafts: {
      ...state.drafts,
      [tabId]: draft,
    },
  };
}

export function clearNoteTabDraft(state: NoteWorkspaceState, tabId: string) {
  if (!state.drafts[tabId]) {
    return state;
  }

  const drafts = { ...state.drafts };
  delete drafts[tabId];
  return { ...state, drafts };
}

export function syncNoteTabSummary(state: NoteWorkspaceState, note: NoteSummary) {
  const tab = getTabByNoteIdentity(state, note);
  if (!tab) {
    return state;
  }

  return {
    ...state,
    tabs: {
      ...state.tabs,
      [tab.tabId]: {
        ...tab,
        title: getTabTitle(note),
        shortId: note.shortId || tab.shortId,
        updatedAtMillis: note.updatedAtMillis,
      },
    },
  };
}

export function toPersistedNoteWorkspaceLayout(state: NoteWorkspaceState): PersistedNoteWorkspaceLayout {
  return {
    version: 1,
    scopeKey: state.scopeKey,
    tabs: state.tabs,
    panes: state.panes,
    activePaneId: state.activePaneId,
  };
}

export function hydrateNoteWorkspaceLayout(scopeKey: string, layout: unknown): NoteWorkspaceState {
  if (!layout || typeof layout !== 'object') {
    return createEmptyNoteWorkspaceState(scopeKey);
  }

  const value = layout as Partial<PersistedNoteWorkspaceLayout>;
  if (value.version !== 1 || value.scopeKey !== scopeKey || !value.tabs || !Array.isArray(value.panes)) {
    return createEmptyNoteWorkspaceState(scopeKey);
  }

  const tabs = Object.fromEntries(
    Object.entries(value.tabs).filter((entry): entry is [string, OpenNoteTab] => {
      const [tabId, tab] = entry;
      return Boolean(
        tab
        && typeof tabId === 'string'
        && typeof tab.tabId === 'string'
        && tab.tabId === tabId
        && typeof tab.noteId === 'string'
        && (typeof tab.teamPath === 'string' || tab.teamPath === null)
        && typeof tab.title === 'string'
      );
    }),
  );

  const panes = value.panes
    .filter((pane): pane is NotePane => Boolean(
      pane
      && typeof pane.paneId === 'string'
      && Array.isArray(pane.tabIds)
      && pane.tabIds.every((tabId) => typeof tabId === 'string')
      && (typeof pane.activeTabId === 'string' || pane.activeTabId === null),
    ))
    .map((pane) => ({ ...pane, size: normalizePaneSize(pane.size, value.panes?.length ?? 1) }))
    .slice(0, MAX_PANES);

  return normalizeState({
    version: 1,
    scopeKey,
    tabs,
    panes,
    activePaneId: typeof value.activePaneId === 'string' ? value.activePaneId : panes[0]?.paneId ?? 'note-pane-primary',
    drafts: {},
    recentlyClosedTabs: [],
  });
}

function getStorageKey(scopeKey: string) {
  return `${NOTE_WORKSPACE_LAYOUT_PREFIX}${scopeKey}`;
}

export function readNoteWorkspaceLayoutStorage(storage: Storage, scopeKey: string) {
  try {
    return hydrateNoteWorkspaceLayout(scopeKey, JSON.parse(storage.getItem(getStorageKey(scopeKey)) ?? 'null'));
  } catch {
    return createEmptyNoteWorkspaceState(scopeKey);
  }
}

export function writeNoteWorkspaceLayoutStorage(storage: Storage, state: NoteWorkspaceState) {
  storage.setItem(getStorageKey(state.scopeKey), JSON.stringify(toPersistedNoteWorkspaceLayout(state)));
}
