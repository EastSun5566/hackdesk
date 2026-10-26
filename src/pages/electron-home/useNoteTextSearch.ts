import { useEffect, useMemo, useState } from 'react';

import { getHackDeskAPI } from '@/lib/electron-api';
import type { NoteSearchScope } from '@/lib/note-index';

import type { WorkspaceScope } from './types';

const SEARCH_DELAY_MS = 150;

export type NoteTextSearch = {
  /** Note ID → snippet with marked matches. */
  matches: ReadonlyMap<string, string>;
  /** How many of the workspace's notes the search covered: all vault notes, or the HackMD notes opened before. */
  indexedCount: number;
  source: NoteSearchScope['type'] | null;
};

const NO_MATCHES: NoteTextSearch = { matches: new Map(), indexedCount: 0, source: null };

export function getNoteSearchScope(scope: WorkspaceScope): NoteSearchScope | null {
  if (scope.type === 'local') return scope.vaultId ? { type: 'local', vaultId: scope.vaultId } : null;
  if (scope.type === 'personal') return { type: 'hackmd', teamPath: null };
  if (scope.type === 'team') return { type: 'hackmd', teamPath: scope.teamPath };
  // History mixes workspaces; its notes are found by title.
  return null;
}

/**
 * Searches note text in the current workspace as the finder query changes. `revision` re-runs the
 * search when the workspace's notes change underneath an unchanged query.
 */
export function useNoteTextSearch(scope: WorkspaceScope, query: string, revision: unknown): NoteTextSearch {
  const api = getHackDeskAPI();
  const searchScope = getNoteSearchScope(scope);
  const scopeKey = searchScope ? JSON.stringify(searchScope) : null;
  const trimmed = query.trim();
  const [result, setResult] = useState<{ key: string; value: NoteTextSearch } | null>(null);
  const key = `${scopeKey}\n${trimmed}`;

  useEffect(() => {
    if (!api?.noteIndex || !scopeKey || !trimmed) return undefined;
    const noteIndex = api.noteIndex;
    let current = true;
    const timer = window.setTimeout(() => {
      const target = JSON.parse(scopeKey) as NoteSearchScope;
      void noteIndex.search({ query: trimmed, scope: target }).then((response) => {
        if (!current) return;
        setResult({
          key,
          value: {
            matches: new Map(response.matches.map(match => [match.noteId, match.snippet])),
            indexedCount: response.indexedCount,
            source: target.type,
          },
        });
      }).catch(() => undefined);
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [api, key, revision, scopeKey, trimmed]);

  // Results for an older query or workspace never show against the current one.
  return useMemo(() => (result?.key === key ? result.value : NO_MATCHES), [key, result]);
}
