import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyNoteWorkspaceState, openDraftNoteTab, readNoteWorkspaceLayoutStorage, writeNoteWorkspaceLayoutStorage } from './note-workspace';
import { INITIAL_DRAFT_SCOPE_KEY, mergeInitialDrafts } from './initial-draft-workspace';
import { useNoteWorkspaceTabs } from './useNoteWorkspaceTabs';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe('initial drafts', () => {
  it('starts once, restores the last input, and respects closing every tab', () => {
    const first = renderHook(() => useNoteWorkspaceTabs(INITIAL_DRAFT_SCOPE_KEY, true));
    const id = first.result.current.activeTab!.tabId;
    expect(Object.keys(first.result.current.state.tabs)).toHaveLength(1);
    act(() => { first.result.current.updateDraft(id, { title: 'First', content: 'Latest input' }); });
    first.unmount();
    const restored = renderHook(() => useNoteWorkspaceTabs(INITIAL_DRAFT_SCOPE_KEY, true));
    expect(restored.result.current.activeTab!.tabId).toBe(id);
    expect(restored.result.current.state.drafts[id].content).toBe('Latest input');
    act(() => { restored.result.current.closeTab(id); });
    restored.unmount();
    const empty = renderHook(() => useNoteWorkspaceTabs(INITIAL_DRAFT_SCOPE_KEY, true));
    expect(empty.result.current.activeTab).toBeNull();
  });

  it('keeps split panes and moves every draft without saving them as notes', () => {
    const { result, rerender } = renderHook((key: string) => useNoteWorkspaceTabs(key), { initialProps: INITIAL_DRAFT_SCOPE_KEY });
    act(() => { result.current.openDraftNote({ content: 'First' }); });
    act(() => { result.current.splitActiveTab(); });
    act(() => { result.current.openDraftNote({ content: 'Second' }); });
    const before = result.current.state;
    act(() => { result.current.transferInitialDrafts('local:vault-a'); });
    rerender('local:vault-a');
    expect(result.current.state.tabs).toEqual(before.tabs);
    expect(result.current.state.drafts).toEqual(before.drafts);
    expect(result.current.state.layout).toEqual(before.layout);
    expect(result.current.state.panes).toEqual(before.panes);
    expect(readNoteWorkspaceLayoutStorage(localStorage, INITIAL_DRAFT_SCOPE_KEY).tabs).toEqual({});
  });

  it('preserves an existing target and appends drafts in pane order, selecting the requested draft', () => {
    const target = openDraftNoteTab(createEmptyNoteWorkspaceState('personal'), { content: 'Existing target' });
    const first = openDraftNoteTab(createEmptyNoteWorkspaceState(INITIAL_DRAFT_SCOPE_KEY), { content: 'First' });
    const source = openDraftNoteTab(first, { content: 'Second' });
    const selected = first.panes[0].activeTabId!;
    const next = mergeInitialDrafts(source, target, selected);
    expect(next.layout).toEqual(target.layout);
    expect(next.backStack).toEqual(target.backStack);
    expect(next.drafts[target.panes[0].activeTabId!].content).toBe('Existing target');
    expect(next.panes[0].tabIds).toEqual([...target.panes[0].tabIds, ...source.panes[0].tabIds]);
    expect(next.panes[0].activeTabId).toBe(selected);
    expect(mergeInitialDrafts(source, next, selected)).toEqual(next);
  });

  it.each([1, 2, 3])('keeps source text when handoff write %i fails and retries without duplicates', failure => {
    const target = openDraftNoteTab(createEmptyNoteWorkspaceState('local:vault-a'), { content: 'Existing target' });
    writeNoteWorkspaceLayoutStorage(localStorage, target);
    const { result, rerender } = renderHook((key: string) => useNoteWorkspaceTabs(key), { initialProps: INITIAL_DRAFT_SCOPE_KEY });
    act(() => { result.current.openDraftNote({ content: 'Last input' }); });
    const id = result.current.activeTab!.tabId;
    const setItem = Storage.prototype.setItem;
    let writes = 0;
    const broken = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (++writes === failure) throw new DOMException('Full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    });
    act(() => { expect(() => result.current.transferInitialDrafts('local:vault-a')).toThrow('Your text is still here'); });
    expect(result.current.state.drafts[id].content).toBe('Last input');
    broken.mockRestore();
    act(() => { result.current.updateDraft(id, { title: '', content: 'Even newer input' }); });
    act(() => { result.current.transferInitialDrafts('local:vault-a'); });
    rerender('local:vault-a');
    expect(result.current.state.drafts[id].content).toBe('Even newer input');
    expect(result.current.state.panes.flatMap(pane => pane.tabIds).filter(tabId => tabId === id)).toHaveLength(1);
    expect(result.current.state.drafts[target.panes[0].activeTabId!].content).toBe('Existing target');
  });

  it('does not create or persist a draft until a workspace identity is ready', () => {
    const { result } = renderHook(() => useNoteWorkspaceTabs(null, true));
    act(() => { result.current.openDraftNote({ content: 'Not ready' }); });
    expect(result.current.activeTab).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('recovers a handoff interrupted after the target write and keeps existing remote state untouched', () => {
    const personal = openDraftNoteTab(createEmptyNoteWorkspaceState('personal'), { content: 'Earlier remote draft' });
    writeNoteWorkspaceLayoutStorage(localStorage, personal);
    const source = openDraftNoteTab(createEmptyNoteWorkspaceState(INITIAL_DRAFT_SCOPE_KEY), { content: 'Initial draft' });
    writeNoteWorkspaceLayoutStorage(localStorage, source);
    writeNoteWorkspaceLayoutStorage(localStorage, mergeInitialDrafts(source, personal));
    const { result, rerender } = renderHook((key: string) => useNoteWorkspaceTabs(key), { initialProps: INITIAL_DRAFT_SCOPE_KEY });
    const id = result.current.activeTab!.tabId;
    act(() => { result.current.updateDraft(id, { title: '', content: 'Last input after restart' }); });
    act(() => { result.current.transferInitialDrafts('personal'); });
    rerender('personal');
    expect(Object.keys(result.current.state.tabs)).toHaveLength(2);
    expect(result.current.state.drafts[id].content).toBe('Last input after restart');
    expect(result.current.state.drafts[personal.panes[0].activeTabId!].content).toBe('Earlier remote draft');
  });
});
