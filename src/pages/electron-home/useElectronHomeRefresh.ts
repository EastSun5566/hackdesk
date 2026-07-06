import { useCallback } from 'react';

import type { WorkspaceScope } from './types';

type RefetchableQuery = {
  refetch: () => unknown;
};

export type ElectronHomeRefreshQueries = {
  folderOrderQuery: RefetchableQuery;
  foldersQuery: RefetchableQuery;
  notesQuery: RefetchableQuery;
  teamsQuery: RefetchableQuery;
  userQuery: RefetchableQuery;
};

export function useElectronHomeRefresh({
  localVaultQuery,
  queries,
  scopeType,
}: {
  localVaultQuery?: RefetchableQuery;
  queries: ElectronHomeRefreshQueries;
  scopeType: WorkspaceScope['type'];
}) {
  return useCallback(() => {
    if (scopeType === 'local') {
      void localVaultQuery?.refetch();
      return;
    }

    void queries.userQuery.refetch();
    void queries.teamsQuery.refetch();
    void queries.notesQuery.refetch();

    if (scopeType !== 'history') {
      void queries.foldersQuery.refetch();
      void queries.folderOrderQuery.refetch();
    }
  }, [
    localVaultQuery,
    queries.folderOrderQuery,
    queries.foldersQuery,
    queries.notesQuery,
    queries.teamsQuery,
    queries.userQuery,
    scopeType,
  ]);
}
