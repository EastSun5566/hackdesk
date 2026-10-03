import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import { useNoteWorkspaceTabs } from './useNoteWorkspaceTabs';
import { useWorkbenchWorkspaceState } from './useWorkbenchWorkspaceState';
import { useWorkbenchFinder } from './useWorkbenchFinder';
import { useElectronHomeShellEffects } from './useElectronHomeShellEffects';
import { readNoteWorkspaceLayoutStorage } from './note-workspace';
import type { NoteSummary } from '@/lib/electron-api';

function useFixture(vaultId: string | null) {
  const workspace = useWorkbenchWorkspaceState({ initialWorkspaceScope: { type: 'local', label: 'Local Vault' }, localVaultId: vaultId, manualEmptyWorkspaceRef: { current: false } });
  const tabs = useNoteWorkspaceTabs(workspace.scopeStorageKey);
  const finder = useWorkbenchFinder({ initialScopeStorageKey: workspace.initialScopeStorageKey, scopeStorageKey: workspace.scopeStorageKey, selectedFolderId: workspace.selectedFolderId, setNavigatorCollapsed: () => {} });
  useElectronHomeShellEffects({ collapsedFolderIds: workspace.collapsedFolderIds, scopeStorageKey: workspace.scopeStorageKey, openQuickCaptureDraft: () => ({ accepted: true }), runAction: () => {} });
  return { workspace, tabs, finder };
}

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });

describe('vault workspace isolation', () => {
  it.each(['personal', 'team:design'])('applies captured completions to inactive %s, preserving later edits and restart state', (scopeKey) => {
    const { result, rerender, unmount } = renderHook(useNoteWorkspaceTabs, { initialProps: scopeKey });
    act(() => { result.current.openDraftNote({ title: 'Submitted', content: 'Submitted body' }); });
    const tabId = result.current.activeTab!.tabId;
    const origin = result.current;
    const submittedDraft = { title: 'Submitted', content: 'Submitted body' };
    act(() => { result.current.updateDraft(tabId, { title: 'Later title', content: 'Later input' }); });
    const note = { id: 'saved', shortId: 'saved', title: 'Submitted', content: 'Submitted body', teamPath: null, updatedAtMillis: 2 } as NoteSummary;
    rerender('team:other');
    act(() => { result.current.openRecoverableDraftNote({ title: 'B', content: 'B body' }); });
    const destination = result.current.state;
    act(() => {
      origin.materializeDraftNote(tabId, note, submittedDraft);
      origin.syncNoteSummary(note);
    });
    expect(result.current.state).toEqual(destination);
    expect(readNoteWorkspaceLayoutStorage(localStorage, scopeKey).drafts[tabId]).toMatchObject({
      title: 'Later title', content: 'Later input', baseTitle: 'Submitted', baseContent: 'Submitted body',
    });
    rerender(scopeKey);
    expect(result.current.state.tabs[tabId]).toMatchObject({ noteId: 'saved' });
    act(() => { result.current.splitActiveTab(); });
    const source = result.current;
    const stateBeforeSave = source.state;
    rerender('team:other');
    act(() => { source.reconcileSavedNote({ tabId, note, submittedDraft: { title: 'Later title', content: 'Later input' } }); });
    expect(result.current.state).toEqual(destination);
    rerender(scopeKey);
    expect(result.current.state.backStack).toEqual(stateBeforeSave.backStack);
    expect(result.current.state.activePaneId).toBe(stateBeforeSave.activePaneId);
    unmount();
    const restarted = renderHook(useNoteWorkspaceTabs, { initialProps: scopeKey });
    expect(restarted.result.current.state.drafts[tabId]).toBeUndefined();
    expect(restarted.result.current.state.panes).toEqual(stateBeforeSave.panes);
  });

  it('flushes last input before debounce, restores dual panes and isolates finder/folders across A → B → A and restart', () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(useFixture, { initialProps: 'A' as string | null });
    act(() => { result.current.tabs.openDraftNote({ content: 'Draft A' }); });
    const tabId = result.current.tabs.activeTab!.tabId;
    act(() => { result.current.tabs.openDraftNote({ content: 'Another A draft' }); });
    act(() => { result.current.tabs.selectTab(result.current.tabs.state.activePaneId, tabId); });
    act(() => {
      result.current.tabs.splitActiveTab();
      result.current.tabs.updateDraft(tabId, { title: 'A', content: 'Last input, before debounce' });
      result.current.finder.setFinderState({ ...DEFAULT_NOTE_FINDER_STATE, query: 'A search' });
      result.current.workspace.setCollapsedFolderIds(new Set(['A folder']));
      result.current.workspace.setSelectedFolderId('A selection');
    });
    const stateA = result.current.tabs.state;
    expect(stateA.backStack.length).toBeGreaterThan(0);
    rerender('B');
    expect(result.current.tabs.state.tabs).toEqual({});
    expect(result.current.finder.activeFinderState.query).toBe('');
    expect(result.current.workspace.selectedFolderId).toBeNull();
    expect(result.current.workspace.collapsedFolderIds.size).toBe(0);
    expect(readNoteWorkspaceLayoutStorage(localStorage, 'local:A').drafts[tabId].content).toBe('Last input, before debounce');
    act(() => { result.current.tabs.openRecoverableDraftNote({ content: 'Draft B' }); });
    rerender('A');
    expect(result.current.tabs.state).toEqual(stateA);
    expect(result.current.finder.activeFinderState.query).toBe('A search');
    expect(result.current.workspace.collapsedFolderIds).toEqual(new Set(['A folder']));
    expect(result.current.workspace.selectedFolderId).toBeNull();
    unmount();
    const restarted = renderHook(useFixture, { initialProps: 'A' as string | null });
    expect(restarted.result.current.tabs.state.panes).toEqual(stateA.panes);
    expect(restarted.result.current.tabs.state.drafts).toEqual(stateA.drafts);
    expect(restarted.result.current.finder.activeFinderState.query).toBe('A search');
    restarted.rerender('B');
    expect(Object.values(restarted.result.current.tabs.state.drafts)[0].content).toBe('Draft B');
  });

  it('does not restore or persist an unidentified Local workspace or accept a Quick Hack draft', () => {
    const { result, rerender } = renderHook(useFixture, { initialProps: null as string | null });
    expect(result.current.workspace.scopeStorageKey).toBeNull();
    expect(() => result.current.tabs.openRecoverableDraftNote({ content: 'Keep in popup' })).toThrow('still loading');
    act(() => { result.current.tabs.openDraftNote({ content: 'Cannot persist' }); });
    expect(localStorage.length).toBe(0);
    rerender('A');
    expect(result.current.tabs.state.scopeKey).toBe('local:A');
  });

  it('retains remote keys and restores remote tabs independently', () => {
    const { result, rerender } = renderHook(useNoteWorkspaceTabs, { initialProps: 'personal' as string | null });
    act(() => { result.current.openRecoverableDraftNote({ content: 'Remote draft' }); });
    const personal = result.current.state;
    rerender('local:A');
    expect(result.current.state.tabs).toEqual({});
    rerender('team:design');
    expect(result.current.state.scopeKey).toBe('team:design');
    rerender('personal');
    expect(result.current.state).toEqual(personal);
    expect(localStorage.getItem('hackdesk_note_workspace:personal')).toContain('Remote draft');
  });
});
