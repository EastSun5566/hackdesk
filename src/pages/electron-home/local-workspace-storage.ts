import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { ELECTRON_RECENT_NOTES_STORAGE_KEY, normalizeRecentNotes } from '@/lib/electron-recent-notes';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

export const LOCAL_WORKSPACE_MIGRATION_KEY = 'hackdesk_local_workspace_migration_v1';
export const LOCAL_WORKSPACE_BACKUP_KEY = 'hackdesk_local_workspace_backup_v1';
const prefixes = ['hackdesk_note_workspace:', 'hackdesk_note_finder:', 'hackdesk_folder_collapsed:'];

export function migrateLocalWorkspaceStorage(storage: Storage, snapshot: LocalVaultSnapshot) {
  if (storage.getItem(LOCAL_WORKSPACE_MIGRATION_KEY)) return;
  const scopeKey = `local:${snapshot.vaultId}`;
  // Keep the original bytes, including malformed or unidentifiable old records.
  if (!storage.getItem(LOCAL_WORKSPACE_BACKUP_KEY)) {
    storage.setItem(LOCAL_WORKSPACE_BACKUP_KEY, JSON.stringify(Object.fromEntries(
      [...prefixes.map((prefix) => `${prefix}local`), ELECTRON_RECENT_NOTES_STORAGE_KEY]
        .map((key) => [key, storage.getItem(key)]),
    )));
  }
  for (const prefix of prefixes) {
    const target = `${prefix}${scopeKey}`;
    const old = storage.getItem(`${prefix}local`);
    if (old === null || storage.getItem(target) !== null) continue;
    if (prefix === prefixes[0]) {
      try {
        const layout = JSON.parse(old);
        if (!layout || layout.scopeKey !== 'local' || ![1, 2].includes(layout.version)) continue;
        storage.setItem(target, JSON.stringify({ ...layout, scopeKey }));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    } else {
      storage.setItem(target, old);
    }
  }
  const recent = storage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY);
  if (recent !== null) {
    let parsed: unknown;
    try { parsed = JSON.parse(recent); } catch { parsed = []; }
    const ids = new Set(snapshot.notes.map((note) => note.id));
    storage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify(normalizeRecentNotes(parsed).map((note) => (
      note.teamPath === LOCAL_VAULT_TEAM_PATH && !note.vaultId && ids.has(note.noteId)
        ? { ...note, vaultId: snapshot.vaultId }
        : note
    ))));
  }
  storage.setItem(LOCAL_WORKSPACE_MIGRATION_KEY, snapshot.vaultId);
}
