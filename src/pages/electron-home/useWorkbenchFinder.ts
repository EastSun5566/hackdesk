import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  isNoteFinderActive,
  readNoteFinderState,
  writeNoteFinderState,
  type NoteFinderState,
} from '@/lib/electron-note-finder';

import {
  NAVIGATOR_COLLAPSED_KEY,
  writeBooleanStorage,
} from './ui-preferences';

export type WorkbenchFinderOptions = {
  initialScopeStorageKey: string | null;
  scopeStorageKey: string | null;
  selectedFolderId: string | null;
  setNavigatorCollapsed: Dispatch<SetStateAction<boolean>>;
};

export function useWorkbenchFinder({
  initialScopeStorageKey,
  scopeStorageKey,
  selectedFolderId,
  setNavigatorCollapsed,
}: WorkbenchFinderOptions) {
  const [finderState, setFinderState] = useState<NoteFinderState>(() => (
    readNoteFinderState(window.localStorage, initialScopeStorageKey ?? '')
  ));
  const [finderScopeKey, setFinderScopeKey] = useState(scopeStorageKey);
  if (finderScopeKey !== scopeStorageKey) {
    setFinderScopeKey(scopeStorageKey);
    setFinderState(readNoteFinderState(window.localStorage, scopeStorageKey ?? ''));
  }
  const activeFinderState = useMemo<NoteFinderState>(() => (
    !selectedFolderId && finderState.searchScope === 'current-folder'
      ? { ...finderState, searchScope: 'workspace' }
      : finderState
  ), [finderState, selectedFolderId]);
  const deferredFinderQuery = useDeferredValue(activeFinderState.query);
  const deferredFinderState = useMemo<NoteFinderState>(() => ({
    ...activeFinderState,
    query: deferredFinderQuery,
  }), [activeFinderState, deferredFinderQuery]);
  const finderActive = isNoteFinderActive(deferredFinderState);

  const loadFinderStateForScope = useCallback((nextScopeStorageKey: string) => {
    setFinderScopeKey(nextScopeStorageKey);
    setFinderState(readNoteFinderState(window.localStorage, nextScopeStorageKey));
  }, []);

  const focusNoteSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const input = document.querySelector<HTMLInputElement>('input[name="noteSearch"]');
        input?.focus();
        input?.select();
      });
    });
  }, []);

  const focusWorkspaceSearch = useCallback(() => {
    setNavigatorCollapsed(false);
    writeBooleanStorage(NAVIGATOR_COLLAPSED_KEY, false);
    setFinderState((current) => ({
      ...current,
      searchScope: 'workspace',
    }));
    focusNoteSearchInput();
  }, [focusNoteSearchInput, setNavigatorCollapsed]);

  useEffect(() => {
    if (!scopeStorageKey || finderScopeKey !== scopeStorageKey) return;

    writeNoteFinderState(window.localStorage, scopeStorageKey, activeFinderState);
  }, [activeFinderState, scopeStorageKey, finderScopeKey]);

  return {
    activeFinderState,
    deferredFinderState,
    finderActive,
    focusWorkspaceSearch,
    loadFinderStateForScope,
    setFinderState,
  };
}
