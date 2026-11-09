import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RestoreTrashResult } from '@/lib/electron-api';

import { trashListQueryKey, useRestoreNotes, useTrashList } from './useTrash';
import type { WorkspaceScope } from './types';

const personalScope: WorkspaceScope = { type: 'personal', label: 'My Workspace' };

const ids = Array.from({ length: 205 }, (_, index) => `note-${index}`);

function succeed(noteIds: string[]): RestoreTrashResult {
  return Object.fromEntries(noteIds.map((noteId) => [noteId, { status: 'success' as const }]));
}

function renderRestore(restoreNotes: (noteIds: string[]) => Promise<RestoreTrashResult>) {
  window.hackdeskAPI = { hackmd: { restoreNotes: vi.fn(restoreNotes) } } as unknown as NonNullable<typeof window.hackdeskAPI>;
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useRestoreNotes(personalScope), { wrapper });
  return { result, restoreNotes: window.hackdeskAPI.hackmd.restoreNotes };
}

describe('useTrashList', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('keeps personal and team trash in separate query keys', () => {
    window.hackdeskAPI = {
      hackmd: { listTrash: vi.fn(async () => []) },
    } as unknown as NonNullable<typeof window.hackdeskAPI>;
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

    const { rerender } = renderHook(
      ({ teamPath }: { teamPath: string | null }) => useTrashList(true, teamPath),
      { wrapper, initialProps: { teamPath: null as string | null } },
    );

    expect(queryClient.getQueryCache().findAll()).toHaveLength(1);
    expect(queryClient.getQueryCache().findAll()[0]?.queryKey).toEqual(trashListQueryKey(null));

    rerender({ teamPath: 'demo-team' });
    expect(queryClient.getQueryCache().findAll()).toHaveLength(2);
    expect(queryClient.getQueryCache().findAll().map((query) => query.queryKey)).toEqual([
      trashListQueryKey(null),
      trashListQueryKey('demo-team'),
    ]);
  });
});

describe('useRestoreNotes', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('sends a large selection in batches of 100 and merges the results', async () => {
    const { result, restoreNotes } = renderRestore(async (noteIds) => succeed(noteIds));

    let outcome: RestoreTrashResult | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync(ids);
    });

    expect(vi.mocked(restoreNotes).mock.calls.map(([noteIds]) => noteIds.length)).toEqual([100, 100, 5]);
    expect(Object.keys(outcome!)).toHaveLength(205);
  });

  it('keeps earlier batches when a later one fails', async () => {
    const { result } = renderRestore(async (noteIds) => {
      if (noteIds[0] === 'note-100') throw new Error('Offline');
      return succeed(noteIds);
    });

    let outcome: RestoreTrashResult | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync(ids);
    });

    expect(outcome!['note-99']).toEqual({ status: 'success' });
    expect(outcome!['note-100']).toEqual({ status: 'failure', reason: 'UNKNOWN' });
    expect(outcome!['note-204']).toEqual({ status: 'failure', reason: 'UNKNOWN' });
  });

  it('fails the whole restore when the first batch fails', async () => {
    const { result } = renderRestore(async () => {
      throw new Error('Offline');
    });

    await act(async () => {
      await expect(result.current.mutateAsync(['note-1'])).rejects.toThrow('Offline');
    });
  });
});
