import type { QueryClient } from '@tanstack/react-query';
import type { ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';
import { getActiveLocalVaultPath } from '@/lib/settings';

export function getLocalVaultSnapshotQueryKey(path: string | null = null) {
  return ['electron', 'local-vault', 'snapshot', path] as const;
}

/** A non-active folder's snapshot, kept apart by its stored vault id. */
export function getLocalVaultVaultSnapshotQueryKey(vaultId: string) {
  return ['electron', 'local-vault', 'vault-snapshot', vaultId] as const;
}

export function getLocalVaultDocumentQueryKey(noteId: string, vaultId?: string) {
  return ['electron', 'local-vault', 'note', vaultId ?? null, noteId] as const;
}

/**
 * Stores a snapshot a mutation or watcher returned. In a workspace a note can live in a folder
 * other than the open one, so the snapshot goes to that folder's own cache and only replaces the
 * open folder's snapshot when it is that folder.
 */
export function cacheLocalVaultSnapshot(queryClient: QueryClient, snapshot: LocalVaultSnapshot) {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['electron', 'local-vault', 'vault-snapshot'] })) {
    if ((query.state.data as LocalVaultSnapshot | undefined)?.vaultId === snapshot.vaultId) {
      queryClient.setQueryData(query.queryKey, snapshot);
    }
  }
  const settings = queryClient.getQueryData<ElectronSafeSettings>(['electron', 'settings']);
  const activePath = getActiveLocalVaultPath(settings);
  const activeKey = getLocalVaultSnapshotQueryKey(activePath);
  const active = queryClient.getQueryData<LocalVaultSnapshot | null>(activeKey);
  // An unknown active path (settings not loaded yet) can't contradict the snapshot, and mutations
  // only run against the active vault; a known path must match before the snapshot may land here.
  // A scan reports its resolved root, so that match only holds when the stored path is already
  // resolved (not through /var on macOS, or a short name on Windows). The session itself writes
  // the open folder's key by stored path, so nothing relies on this fallback for the open folder.
  if ((!active && (activePath === null || activePath === snapshot.rootPath)) || active?.vaultId === snapshot.vaultId) {
    queryClient.setQueryData(activeKey, snapshot);
  }
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
    // A note that left the snapshot is re-read so a deletion is reported instead of showing stale content.
    const removed = !note && previousPaths.has(String(id));
    if (!removed && (!note || !oldPath || note.relativePath === oldPath)) return;
    await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
    await queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
  }));
}

/**
 * `generation` changes whenever the open folder changes; `transitions` only when the window moves
 * to another vault or workspace (choose, disconnect, leaving a set), which also replaces its tabs.
 */
export type VaultAccess = { generation: number; transitions?: number; vaultId: string | null; changing: boolean };

/**
 * Calls addressed by note id. The main process finds the folder that holds the note, so in a
 * workspace they stay valid while another of its folders is opened; only a transition stops them.
 */
const NOTE_ADDRESSED_METHODS = new Set(['readNote', 'writeNote', 'renameNote', 'moveNote', 'trashNote', 'revealNote', 'importAttachment']);

export function guardLocalVaultApi(
  api: HackDeskElectronAPI,
  access: () => VaultAccess,
  bound: VaultAccess = { ...access() },
): HackDeskElectronAPI {
  // Reading another folder by its stored id does not touch the active vault, so a switch in
  // flight must not fail it.
  const unguarded = new Set(['choose', 'disconnect', 'onDidChange', 'getVaultSnapshot']);
  const localVault = Object.fromEntries(Object.entries(api.localVault).map(([name, method]) => {
    if (unguarded.has(name)) return [name, method];
    const noteAddressed = NOTE_ADDRESSED_METHODS.has(name);
    const sameContext = (left: VaultAccess, right: VaultAccess) => (noteAddressed
      ? (left.transitions ?? 0) === (right.transitions ?? 0)
      : left.generation === right.generation && left.vaultId === right.vaultId);
    return [name, async (...args: unknown[]) => {
      const start = { ...access() };
      if (!bound.vaultId || !start.vaultId || start.changing || !sameContext(start, bound)) {
        throw new Error('Local Vault is still loading. Try again when it is ready.');
      }
      const result = await Reflect.apply(method, api.localVault, args);
      const current = access();
      if (current.changing || !sameContext(start, current)) {
        throw new Error('The active Local Vault changed. The previous operation was not applied to this workspace.');
      }
      return result;
    }];
  })) as HackDeskElectronAPI['localVault'];
  return { ...api, localVault };
}
