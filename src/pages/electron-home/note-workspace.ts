import type { NoteSummary } from '@/lib/electron-api';
import type { LocalRevision } from '@/lib/local-vault';

export type NoteIdentity = Pick<NoteSummary, 'id' | 'teamPath'>;

export type SavedOpenNoteTab = {
  kind?: 'note';
  tabId: string;
  noteId: string;
  teamPath: string | null;
  title: string;
  shortId: string | null;
  updatedAtMillis: number | null;
  localRevision?: LocalRevision;
};

export type DraftOpenNoteTab = {
  kind: 'draft';
  tabId: string;
  draftId: string;
  title: string;
  shortId: null;
  updatedAtMillis: null;
};

export type OpenNoteTab = SavedOpenNoteTab | DraftOpenNoteTab;

export type NotePane = {
  paneId: string;
  tabIds: string[];
  activeTabId: string | null;
  size: number;
};

export type NoteNavigationTarget = {
  paneId: string;
  tabId: string;
};

export type NoteDocumentDraft = {
  title: string;
  content: string;
  baseTitle?: string;
  baseContent?: string;
  baseRevision?: LocalRevision;
};

export type OpenDraftNoteOptions = {
  paneId?: string;
  title?: string;
  content?: string;
};

export type NoteWorkspaceState = {
  version: 2;
  scopeKey: string;
  tabs: Record<string, OpenNoteTab>;
  panes: NotePane[];
  activePaneId: string;
  drafts: Record<string, NoteDocumentDraft>;
  recentlyClosedTabs: OpenNoteTab[];
  backStack: NoteNavigationTarget[];
  forwardStack: NoteNavigationTarget[];
};

export type PersistedNoteWorkspaceLayout = Pick<
  NoteWorkspaceState,
  'version' | 'scopeKey' | 'tabs' | 'panes' | 'activePaneId' | 'drafts'
>;

const NOTE_WORKSPACE_LAYOUT_PREFIX = 'hackdesk_note_workspace:';
const MAX_PANES = 2;
const MAX_RECENTLY_CLOSED_TABS = 10;
const MAX_NAVIGATION_STACK = 50;
const MIN_PANE_SIZE = 10;
const MAX_PANE_SIZE = 90;

let nextTabId = 0;
let nextPaneId = 0;

function createTabId() {
  nextTabId += 1;
  return `note-tab-${Date.now()}-${nextTabId}`;
}

function createDraftId() {
  nextTabId += 1;
  return `draft-note-${Date.now()}-${nextTabId}`;
}

function createPaneId() {
  nextPaneId += 1;
  return `note-pane-${Date.now()}-${nextPaneId}`;
}

export function isDraftNoteTab(tab: OpenNoteTab | undefined | null): tab is DraftOpenNoteTab {
  return tab?.kind === 'draft';
}

export function getSavedTabNoteIdentity(tab: OpenNoteTab | undefined | null): NoteIdentity | null {
  return tab && !isDraftNoteTab(tab)
    ? { id: tab.noteId, teamPath: tab.teamPath }
    : null;
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
    version: 2,
    scopeKey,
    tabs: {},
    panes: [pane],
    activePaneId: pane.paneId,
    drafts: {},
    recentlyClosedTabs: [],
    backStack: [],
    forwardStack: [],
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

export function getActiveNavigationTarget(state: NoteWorkspaceState): NoteNavigationTarget | null {
  const pane = getActivePane(state);
  return pane?.activeTabId && state.tabs[pane.activeTabId]
    ? { paneId: pane.paneId, tabId: pane.activeTabId }
    : null;
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
  return Object.values(state.tabs).find((tab) => {
    const tabIdentity = getSavedTabNoteIdentity(tab);
    return tabIdentity ? getNoteIdentityKey(tabIdentity) === identityKey : false;
  }) ?? null;
}

export function getTabPane(state: NoteWorkspaceState, tabId: string) {
  return state.panes.find((pane) => pane.tabIds.includes(tabId)) ?? null;
}

function getTabTitle(note: Pick<NoteSummary, 'title'>) {
  return note.title.trim() || 'Untitled';
}

function getNoteLocalRevision(note: NoteSummary): LocalRevision | undefined {
  const revision = (note as Partial<{ localRevision: LocalRevision }>).localRevision;
  return revision
    && typeof revision.contentHash === 'string'
    && typeof revision.mtimeMs === 'number'
    ? revision
    : undefined;
}

function createTabFromNote(note: NoteSummary, tabId = createTabId()): SavedOpenNoteTab {
  return {
    tabId,
    noteId: note.id,
    teamPath: note.teamPath ?? null,
    title: getTabTitle(note),
    shortId: note.shortId || null,
    updatedAtMillis: note.updatedAtMillis,
    localRevision: getNoteLocalRevision(note),
  };
}

function createDraftTab(): DraftOpenNoteTab {
  return {
    kind: 'draft',
    tabId: createTabId(),
    draftId: createDraftId(),
    title: 'Untitled',
    shortId: null,
    updatedAtMillis: null,
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

  const normalizedBase = { ...state, panes, activePaneId, drafts };

  return {
    ...normalizedBase,
    backStack: normalizeNavigationStack(normalizedBase, state.backStack),
    forwardStack: normalizeNavigationStack(normalizedBase, state.forwardStack),
  };
}

function pushRecentlyClosedTab(state: NoteWorkspaceState, tab: OpenNoteTab) {
  if (isDraftNoteTab(tab)) {
    return state.recentlyClosedTabs;
  }

  const identityKey = getClosedTabKey(tab);
  return [
    tab,
    ...state.recentlyClosedTabs.filter((candidate) => (
      getClosedTabKey(candidate) !== identityKey
    )),
  ].slice(0, MAX_RECENTLY_CLOSED_TABS);
}

function getClosedTabKey(tab: OpenNoteTab) {
  return isDraftNoteTab(tab)
    ? `draft:${tab.draftId}`
    : getNoteIdentityKey({ id: tab.noteId, teamPath: tab.teamPath });
}

function navigationTargetEquals(left: NoteNavigationTarget | null, right: NoteNavigationTarget | null) {
  return Boolean(left && right && left.paneId === right.paneId && left.tabId === right.tabId);
}

function isValidNavigationTarget(state: Pick<NoteWorkspaceState, 'panes' | 'tabs'>, target: NoteNavigationTarget) {
  const pane = state.panes.find((candidate) => candidate.paneId === target.paneId);
  return Boolean(pane?.tabIds.includes(target.tabId) && state.tabs[target.tabId]);
}

function normalizeNavigationStack(state: Pick<NoteWorkspaceState, 'panes' | 'tabs'>, stack: NoteNavigationTarget[]) {
  const seen = new Set<string>();
  const targets: NoteNavigationTarget[] = [];

  for (const target of stack) {
    const key = `${target.paneId}:${target.tabId}`;
    if (!seen.has(key) && isValidNavigationTarget(state, target)) {
      targets.push(target);
      seen.add(key);
    }
  }

  return targets.slice(0, MAX_NAVIGATION_STACK);
}

function pushNavigationTarget(stack: NoteNavigationTarget[], target: NoteNavigationTarget) {
  return [
    target,
    ...stack.filter((candidate) => !navigationTargetEquals(candidate, target)),
  ].slice(0, MAX_NAVIGATION_STACK);
}

function withNavigationHistory(previous: NoteWorkspaceState, next: NoteWorkspaceState) {
  const previousTarget = getActiveNavigationTarget(previous);
  const nextTarget = getActiveNavigationTarget(next);

  if (!previousTarget || !nextTarget || navigationTargetEquals(previousTarget, nextTarget)) {
    return next;
  }

  return {
    ...next,
    backStack: pushNavigationTarget(next.backStack, previousTarget),
    forwardStack: [],
  };
}

function activateNavigationTarget(state: NoteWorkspaceState, target: NoteNavigationTarget) {
  return normalizeState({
    ...state,
    activePaneId: target.paneId,
    panes: state.panes.map((pane) => pane.paneId === target.paneId
      ? { ...pane, activeTabId: target.tabId }
      : pane),
  });
}

export function navigateNoteWorkspace(state: NoteWorkspaceState, direction: 'back' | 'forward') {
  const currentTarget = getActiveNavigationTarget(state);
  if (!currentTarget) {
    return state;
  }

  const sourceStack = direction === 'back' ? state.backStack : state.forwardStack;
  const destinationStack = direction === 'back' ? state.forwardStack : state.backStack;
  const [target, ...remainingStack] = normalizeNavigationStack(state, sourceStack)
    .filter((candidate) => !navigationTargetEquals(candidate, currentTarget));

  if (!target) {
    return {
      ...state,
      backStack: direction === 'back' ? [] : state.backStack,
      forwardStack: direction === 'forward' ? [] : state.forwardStack,
    };
  }

  const next = activateNavigationTarget(state, target);
  return {
    ...next,
    backStack: direction === 'back' ? remainingStack : pushNavigationTarget(destinationStack, currentTarget),
    forwardStack: direction === 'back' ? pushNavigationTarget(destinationStack, currentTarget) : remainingStack,
  };
}

export function openNoteTab(state: NoteWorkspaceState, note: NoteSummary, paneId = state.activePaneId) {
  const existingTab = getTabByNoteIdentity(state, note);
  if (existingTab) {
    const pane = getTabPane(state, existingTab.tabId) ?? getActivePane(state);
    return selectNoteTab(state, pane.paneId, existingTab.tabId);
  }

  const pane = state.panes.find((candidate) => candidate.paneId === paneId) ?? getActivePane(state);
  const tab = createTabFromNote(note);
  const next = normalizeState({
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
  return withNavigationHistory(state, next);
}

function normalizeOpenDraftNoteOptions(options?: string | OpenDraftNoteOptions): OpenDraftNoteOptions {
  return typeof options === 'string' ? { paneId: options } : options ?? {};
}

export function openDraftNoteTab(state: NoteWorkspaceState, options?: string | OpenDraftNoteOptions) {
  const draftOptions = normalizeOpenDraftNoteOptions(options);
  const paneId = draftOptions.paneId ?? state.activePaneId;
  const pane = state.panes.find((candidate) => candidate.paneId === paneId) ?? getActivePane(state);
  const tab = createDraftTab();
  const draftTitle = draftOptions.title?.trim() || tab.title;
  const next = normalizeState({
    ...state,
    tabs: {
      ...state.tabs,
      [tab.tabId]: tab,
    },
    drafts: {
      ...state.drafts,
      [tab.tabId]: {
        title: draftTitle,
        content: draftOptions.content ?? '',
      },
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
  return withNavigationHistory(state, next);
}

export function materializeDraftNoteTab(state: NoteWorkspaceState, tabId: string, note: NoteSummary) {
  const tab = state.tabs[tabId];
  if (!isDraftNoteTab(tab)) {
    return state;
  }

  const drafts = { ...state.drafts };
  delete drafts[tabId];

  return normalizeState({
    ...state,
    tabs: {
      ...state.tabs,
      [tabId]: createTabFromNote(note, tabId),
    },
    drafts,
  });
}

export function selectNoteTab(state: NoteWorkspaceState, paneId: string, tabId: string) {
  if (!state.tabs[tabId]) {
    return state;
  }

  const next = normalizeState({
    ...state,
    panes: state.panes.map((pane) => pane.paneId === paneId && pane.tabIds.includes(tabId)
      ? { ...pane, activeTabId: tabId }
      : pane),
    activePaneId: paneId,
  });
  return withNavigationHistory(state, next);
}

export function focusNotePane(state: NoteWorkspaceState, paneId: string) {
  const next = state.panes.some((pane) => pane.paneId === paneId)
    ? { ...state, activePaneId: paneId }
    : state;
  return withNavigationHistory(state, next);
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
    .filter((tab) => {
      const tabIdentity = getSavedTabNoteIdentity(tab);
      return tabIdentity ? getNoteIdentityKey(tabIdentity) === identityKey : false;
    })
    .reduce((nextState, tab) => closeNoteTab(nextState, tab.tabId), state);
  return {
    ...closed,
    recentlyClosedTabs: closed.recentlyClosedTabs.filter((tab) => (
      getSavedTabNoteIdentity(tab)
        ? getNoteIdentityKey(getSavedTabNoteIdentity(tab) as NoteIdentity) !== identityKey
        : true
    )),
  };
}

export function duplicateActiveNoteTab(state: NoteWorkspaceState) {
  const activePane = getActivePane(state);
  const activeTabId = activePane.activeTabId;
  const activeTab = activeTabId ? state.tabs[activeTabId] : null;
  if (!activeTab || !activeTabId) {
    return state;
  }

  const duplicateTab = { ...activeTab, tabId: createTabId() };
  const activeIndex = activePane.tabIds.indexOf(activeTabId);
  const nextTabIds = activeIndex >= 0
    ? [
      ...activePane.tabIds.slice(0, activeIndex + 1),
      duplicateTab.tabId,
      ...activePane.tabIds.slice(activeIndex + 1),
    ]
    : [...activePane.tabIds, duplicateTab.tabId];

  const next = normalizeState({
    ...state,
    tabs: {
      ...state.tabs,
      [duplicateTab.tabId]: duplicateTab,
    },
    panes: state.panes.map((pane) => pane.paneId === activePane.paneId
      ? { ...pane, tabIds: nextTabIds, activeTabId: duplicateTab.tabId }
      : pane),
    activePaneId: activePane.paneId,
    drafts: state.drafts[activeTabId]
      ? { ...state.drafts, [duplicateTab.tabId]: state.drafts[activeTabId] }
      : state.drafts,
  });
  return withNavigationHistory(state, next);
}

export function reopenLastClosedTab(state: NoteWorkspaceState) {
  const [lastClosedTab, ...remainingClosedTabs] = state.recentlyClosedTabs;
  if (!lastClosedTab) {
    return state;
  }

  const pane = getActivePane(state);
  const reopenedTab = { ...lastClosedTab, tabId: createTabId() };
  const next = normalizeState({
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
  return withNavigationHistory(state, next);
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
    const next = normalizeState({
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
    return withNavigationHistory(state, next);
  }

  const next = normalizeState({
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
  return withNavigationHistory(state, next);
}

export function moveActiveTabToOtherPane(state: NoteWorkspaceState) {
  const activePane = getActivePane(state);
  const activeTabId = activePane?.activeTabId;
  const targetPane = state.panes.find((pane) => pane.paneId !== activePane?.paneId);
  if (!activePane || !activeTabId || !targetPane) {
    return state;
  }

  const next = normalizeState({
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
  return withNavigationHistory(state, next);
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

  return focusNotePane(state, state.panes[nextIndex].paneId);
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

export function reconcileSavedNoteTab(
  state: NoteWorkspaceState,
  input: { tabId: string; submittedDraft: NoteDocumentDraft; note: NoteSummary },
) {
  const tab = state.tabs[input.tabId];
  if (!tab || isDraftNoteTab(tab)) {
    return state;
  }

  const currentDraft = state.drafts[input.tabId];
  const submittedUnchanged = currentDraft
    && currentDraft.title === input.submittedDraft.title
    && currentDraft.content === input.submittedDraft.content;
  const drafts = { ...state.drafts };
  if (submittedUnchanged) {
    delete drafts[input.tabId];
  } else if (currentDraft) {
    drafts[input.tabId] = {
      ...currentDraft,
      baseTitle: input.submittedDraft.title,
      baseContent: input.submittedDraft.content,
      baseRevision: getNoteLocalRevision(input.note) ?? currentDraft.baseRevision,
    };
  }

  return {
    ...state,
    drafts,
    tabs: {
      ...state.tabs,
      [input.tabId]: {
        ...tab,
        title: getTabTitle(input.note),
        shortId: input.note.shortId || tab.shortId,
        updatedAtMillis: input.note.updatedAtMillis,
        localRevision: getNoteLocalRevision(input.note) ?? tab.localRevision,
      },
    },
  };
}

export function syncNoteTabSummary(state: NoteWorkspaceState, note: NoteSummary) {
  const tab = getTabByNoteIdentity(state, note);
  if (!tab || isDraftNoteTab(tab)) {
    return state;
  }
  const savedLocalRevision = note.content !== null ? getNoteLocalRevision(note) : undefined;

  return {
    ...state,
    tabs: {
      ...state.tabs,
      [tab.tabId]: {
        ...tab,
        title: getTabTitle(note),
        shortId: note.shortId || tab.shortId,
        updatedAtMillis: note.updatedAtMillis,
        localRevision: savedLocalRevision ?? tab.localRevision,
      },
    },
  };
}

export function toPersistedNoteWorkspaceLayout(state: NoteWorkspaceState): PersistedNoteWorkspaceLayout {
  const meaningfulDrafts = Object.fromEntries(Object.entries(state.drafts).filter(([tabId, draft]) => {
    const tab = state.tabs[tabId];
    return isDraftNoteTab(tab) && Boolean(draft.content.trim() || (draft.title.trim() && draft.title.trim() !== 'Untitled'));
  }));
  const persistedTabs = Object.fromEntries(
    Object.entries(state.tabs).filter(([tabId, tab]) => !isDraftNoteTab(tab) || Boolean(meaningfulDrafts[tabId])),
  );
  const panes = state.panes.map((pane) => {
    const tabIds = pane.tabIds.filter((tabId) => persistedTabs[tabId]);
    return {
      ...pane,
      tabIds,
      activeTabId: pane.activeTabId && persistedTabs[pane.activeTabId]
        ? pane.activeTabId
        : tabIds[0] ?? null,
    };
  });

  return {
    version: 2,
    scopeKey: state.scopeKey,
    tabs: persistedTabs,
    drafts: meaningfulDrafts,
    panes,
    activePaneId: panes.some((pane) => pane.paneId === state.activePaneId)
      ? state.activePaneId
      : panes[0]?.paneId ?? 'note-pane-primary',
  };
}

export function hydrateNoteWorkspaceLayout(scopeKey: string, layout: unknown): NoteWorkspaceState {
  if (!layout || typeof layout !== 'object') {
    return createEmptyNoteWorkspaceState(scopeKey);
  }

  const value = layout as Partial<PersistedNoteWorkspaceLayout>;
  const layoutVersion = (layout as { version?: number }).version;
  if ((layoutVersion !== 1 && layoutVersion !== 2) || value.scopeKey !== scopeKey || !value.tabs || !Array.isArray(value.panes)) {
    return createEmptyNoteWorkspaceState(scopeKey);
  }

  const persistedDrafts = layoutVersion === 2 && value.drafts && typeof value.drafts === 'object' ? value.drafts : {};
  const tabs = Object.fromEntries(
    Object.entries(value.tabs).filter((entry): entry is [string, OpenNoteTab] => {
      const [tabId, tab] = entry;
      if (isDraftNoteTab(tab)) {
        const draft = persistedDrafts[tabId];
        return Boolean(
          typeof tabId === 'string'
          && tab.tabId === tabId
          && typeof tab.draftId === 'string'
          && draft
          && typeof draft.title === 'string'
          && typeof draft.content === 'string'
        );
      }
      return Boolean(
        tab
        && !isDraftNoteTab(tab)
        && typeof tabId === 'string'
        && typeof tab.tabId === 'string'
        && tab.tabId === tabId
        && typeof tab.noteId === 'string'
        && (typeof tab.teamPath === 'string' || tab.teamPath === null)
        && typeof tab.title === 'string'
        && (tab.localRevision === undefined || (
          typeof tab.localRevision.contentHash === 'string'
          && typeof tab.localRevision.mtimeMs === 'number'
        ))
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
    version: 2,
    scopeKey,
    tabs,
    panes,
    activePaneId: typeof value.activePaneId === 'string' ? value.activePaneId : panes[0]?.paneId ?? 'note-pane-primary',
    drafts: Object.fromEntries(Object.entries(persistedDrafts).filter(([tabId, draft]) => Boolean(
      isDraftNoteTab(tabs[tabId])
      && draft
      && typeof draft.title === 'string'
      && typeof draft.content === 'string'
    ))) as Record<string, NoteDocumentDraft>,
    recentlyClosedTabs: [],
    backStack: [],
    forwardStack: [],
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
