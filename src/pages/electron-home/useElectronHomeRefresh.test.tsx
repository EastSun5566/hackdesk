import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useElectronHomeRefresh, type ElectronHomeRefreshQueries } from './useElectronHomeRefresh';

function createQueries(): ElectronHomeRefreshQueries {
  return {
    folderOrderQuery: { refetch: vi.fn() },
    foldersQuery: { refetch: vi.fn() },
    notesQuery: { refetch: vi.fn() },
    teamsQuery: { refetch: vi.fn() },
    userQuery: { refetch: vi.fn() },
  };
}

describe('useElectronHomeRefresh', () => {
  it('refreshes folders and folder order for writable workspaces', () => {
    const queries = createQueries();
    const { result } = renderHook(() => useElectronHomeRefresh({
      queries,
      scopeType: 'personal',
    }));

    result.current();

    expect(queries.userQuery.refetch).toHaveBeenCalledOnce();
    expect(queries.teamsQuery.refetch).toHaveBeenCalledOnce();
    expect(queries.notesQuery.refetch).toHaveBeenCalledOnce();
    expect(queries.foldersQuery.refetch).toHaveBeenCalledOnce();
    expect(queries.folderOrderQuery.refetch).toHaveBeenCalledOnce();
  });

  it('skips folder refresh for history scope', () => {
    const queries = createQueries();
    const { result } = renderHook(() => useElectronHomeRefresh({
      queries,
      scopeType: 'history',
    }));

    result.current();

    expect(queries.userQuery.refetch).toHaveBeenCalledOnce();
    expect(queries.teamsQuery.refetch).toHaveBeenCalledOnce();
    expect(queries.notesQuery.refetch).toHaveBeenCalledOnce();
    expect(queries.foldersQuery.refetch).not.toHaveBeenCalled();
    expect(queries.folderOrderQuery.refetch).not.toHaveBeenCalled();
  });
});
