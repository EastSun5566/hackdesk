import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_NOTE_FINDER_STATE,
  getNoteFinderStorageKey,
  writeNoteFinderState,
} from '@/lib/electron-note-finder';

import { NAVIGATOR_COLLAPSED_KEY } from './ui-preferences';
import { useWorkbenchFinder } from './useWorkbenchFinder';

describe('useWorkbenchFinder', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('restores finder state when the workspace scope changes', () => {
    writeNoteFinderState(window.localStorage, 'team:alpha', {
      ...DEFAULT_NOTE_FINDER_STATE,
      query: 'alpha',
      tagFilters: ['design'],
    });
    const setNavigatorCollapsed = vi.fn();
    const { result, rerender } = renderHook((scopeStorageKey: string) => useWorkbenchFinder({
      initialScopeStorageKey: 'personal',
      scopeStorageKey,
      selectedFolderId: null,
      setNavigatorCollapsed,
    }), {
      initialProps: 'personal',
    });

    act(() => {
      result.current.loadFinderStateForScope('team:alpha');
    });
    rerender('team:alpha');

    expect(result.current.activeFinderState.query).toBe('alpha');
    expect(result.current.activeFinderState.tagFilters).toEqual(['design']);
  });

  it('focuses workspace search and expands the navigator', () => {
    const select = vi.fn();
    const input = document.createElement('input');
    input.name = 'noteSearch';
    input.select = select;
    document.body.append(input);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const setNavigatorCollapsed = vi.fn();
    const { result } = renderHook(() => useWorkbenchFinder({
      initialScopeStorageKey: 'personal',
      scopeStorageKey: 'personal',
      selectedFolderId: 'folder-1',
      setNavigatorCollapsed,
    }));

    act(() => {
      result.current.focusWorkspaceSearch();
    });

    expect(setNavigatorCollapsed).toHaveBeenCalledWith(false);
    expect(window.localStorage.getItem(NAVIGATOR_COLLAPSED_KEY)).toBe('false');
    expect(result.current.activeFinderState.searchScope).toBe('workspace');
    expect(document.activeElement).toBe(input);
    expect(select).toHaveBeenCalledOnce();
  });

  it('persists finder changes under the active scope key', () => {
    const { result } = renderHook(() => useWorkbenchFinder({
      initialScopeStorageKey: 'personal',
      scopeStorageKey: 'personal',
      selectedFolderId: null,
      setNavigatorCollapsed: vi.fn(),
    }));

    act(() => {
      result.current.setFinderState((current) => ({
        ...current,
        query: 'release notes',
      }));
    });

    expect(window.localStorage.getItem(getNoteFinderStorageKey('personal'))).toContain('release notes');
  });
});
