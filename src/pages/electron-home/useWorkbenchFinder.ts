import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
  initialScopeStorageKey: string;
  scopeStorageKey: string;
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
    readNoteFinderState(window.localStorage, initialScopeStorageKey)
  ));
  const skipNextFinderWriteRef = useRef(false);
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
    skipNextFinderWriteRef.current = true;
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
    if (skipNextFinderWriteRef.current) {
      skipNextFinderWriteRef.current = false;
      return;
    }

    writeNoteFinderState(window.localStorage, scopeStorageKey, activeFinderState);
  }, [activeFinderState, scopeStorageKey]);

  return {
    activeFinderState,
    deferredFinderState,
    finderActive,
    focusWorkspaceSearch,
    loadFinderStateForScope,
    setFinderState,
  };
}
