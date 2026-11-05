import { layoutPaneIds } from './pane-layout';
import { isDraftNoteTab, type NoteWorkspaceState } from './note-workspace';

export const INITIAL_DRAFT_SCOPE_KEY = 'initial-drafts';

/** Retrying a handoff keeps stable IDs, so a partially written target is not duplicated. */
export function mergeInitialDrafts(source: NoteWorkspaceState, target: NoteWorkspaceState, selectedTabId?: string | null): NoteWorkspaceState {
  const ids = layoutPaneIds(source.layout).flatMap(id => source.panes.find(pane => pane.paneId === id)?.tabIds ?? []);
  for (const id of ids) {
    const tab = source.tabs[id];
    const existing = target.tabs[id];
    if (!isDraftNoteTab(tab) || (existing && (!isDraftNoteTab(existing) || existing.draftId !== tab.draftId))) {
      throw new Error('The draft could not be moved. Your text is still here.');
    }
  }
  const activeId = selectedTabId ?? source.panes.find(pane => pane.paneId === source.activePaneId)?.activeTabId;
  if (!Object.keys(target.tabs).length) {
    const pane = source.panes.find(pane => pane.tabIds.includes(activeId ?? ''));
    return {
      ...source,
      scopeKey: target.scopeKey,
      activePaneId: pane?.paneId ?? source.activePaneId,
      panes: source.panes.map(candidate => candidate === pane ? { ...candidate, activeTabId: activeId ?? candidate.activeTabId } : candidate),
    };
  }
  const destination = target.panes.find(pane => pane.tabIds.includes(activeId ?? ''))
    ?? target.panes.find(pane => pane.paneId === target.activePaneId)!;
  const alreadyPlaced = new Set(target.panes.flatMap(pane => pane.tabIds));
  return {
    ...target,
    tabs: { ...target.tabs, ...source.tabs },
    drafts: { ...target.drafts, ...source.drafts },
    activePaneId: destination.paneId,
    panes: target.panes.map(pane => pane === destination ? {
      ...pane,
      tabIds: [...pane.tabIds, ...ids.filter(id => !alreadyPlaced.has(id))],
      activeTabId: activeId && source.tabs[activeId] ? activeId : pane.activeTabId,
    } : pane),
  };
}
