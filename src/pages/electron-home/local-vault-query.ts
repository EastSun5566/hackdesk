import type { QueryClient } from '@tanstack/react-query';
import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';

export function getLocalVaultSnapshotQueryKey(path: string | null = null) {
  return ['electron', 'local-vault', 'snapshot', path] as const;
}

export function getLocalVaultDocumentQueryKey(noteId: string, vaultId?: string) {
  return ['electron', 'local-vault', 'note', vaultId ?? null, noteId] as const;
}

export function cacheLocalVaultSnapshot(queryClient: QueryClient, snapshot: LocalVaultSnapshot) {
  const settings = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
  queryClient.setQueryData(getLocalVaultSnapshotQueryKey(settings?.localVault.path ?? null), snapshot);
}

export async function invalidateMovedLocalVaultDocuments(
  queryClient: QueryClient, snapshot: LocalVaultSnapshot, previous?: LocalVaultSnapshot | null,
) {
  const notes = new Map(snapshot.notes.map((note) => [note.id, note]));
  const previousPaths = new Map((previous?.vaultId === snapshot.vaultId ? previous.notes : [])
    .map((note) => [note.id, note.relativePath]));
  const queries = queryClient.getQueryCache().findAll({ queryKey: ['electron', 'local-vault', 'note', snapshot.vaultId] });
  await Promise.all(queries.map(async (query) => {
    const id = query.queryKey[4];
    const note = typeof id === 'string' ? notes.get(id) : undefined;
    const oldPath = (query.state.data as LocalDocument | undefined)?.relativePath ?? previousPaths.get(String(id));
    if (!note || !oldPath || note.relativePath === oldPath) return;
    await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
    await queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
  }));
}

export type VaultAccess = { generation: number; vaultId: string | null; changing: boolean };

export function guardLocalVaultApi(
  api: HackDeskElectronAPI,
  access: () => VaultAccess,
  bound: VaultAccess = { ...access() },
): HackDeskElectronAPI {
  const unguarded = new Set(['choose', 'disconnect', 'onDidChange']);
  const localVault = Object.fromEntries(Object.entries(api.localVault).map(([name, method]) => {
    if (unguarded.has(name)) return [name, method];
    return [name, async (...args: unknown[]) => {
      const start = { ...access() };
      if (!bound.vaultId || start.generation !== bound.generation || start.vaultId !== bound.vaultId || start.changing) {
        throw new Error('Local Vault is still loading. Try again when it is ready.');
      }
      const result = await Reflect.apply(method, api.localVault, args);
      const current = access();
      if (start.generation !== current.generation || start.vaultId !== current.vaultId || current.changing) {
        throw new Error('The active Local Vault changed. The previous operation was not applied to this workspace.');
      }
      return result;
    }];
  })) as HackDeskElectronAPI['localVault'];
  return { ...api, localVault };
}
