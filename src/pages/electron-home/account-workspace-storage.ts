import { ELECTRON_RECENT_NOTES_STORAGE_KEY, normalizeRecentNotes } from '@/lib/electron-recent-notes';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { LAST_WORKSPACE_SCOPE_KEY } from './ui-preferences';

export const ACCOUNT_WORKSPACE_MIGRATION_KEY = 'hackdesk_account_workspace_migration_v1';
export const ACCOUNT_WORKSPACE_BACKUP_KEY = 'hackdesk_account_workspace_backup_v1';
const NOTE_WORKSPACE_PREFIX = 'hackdesk_note_workspace:';
const prefixes = [
  NOTE_WORKSPACE_PREFIX,
  'hackdesk_note_finder:',
  'hackdesk_folder_collapsed:',
  'hackdesk_folder_expanded:',
];

/** Where an account remembers the workspace it last showed. */
export function getLastWorkspaceScopeKey(hackmdAccountId: string | null | undefined) {
  return hackmdAccountId ? `${LAST_WORKSPACE_SCOPE_KEY}:${hackmdAccountId}` : LAST_WORKSPACE_SCOPE_KEY;
}

/** A HackMD scope key from before scope keys named their account: `personal`, `history`, `team:<path>`. */
function isLegacyHackmdScopeKey(scopeKey: string) {
  return (scopeKey === 'personal' || scopeKey === 'history' || /^team:[^@]+$/.test(scopeKey));
}

function storageKeys(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/**
 * Before HackMD workspace state was kept per account, every account shared one copy. The first
 * time an account is active after the update, that copy becomes the account's: only the account
 * that was active then can have made it. The original values are kept in a backup key.
 */
export function migrateAccountWorkspaceStorage(storage: Storage, hackmdAccountId: string) {
  try {
    if (storage.getItem(ACCOUNT_WORKSPACE_MIGRATION_KEY)) return;
    const legacy = storageKeys(storage).flatMap((key) => {
      const prefix = prefixes.find((candidate) => key.startsWith(candidate));
      const scopeKey = prefix ? key.slice(prefix.length) : '';
      return prefix && isLegacyHackmdScopeKey(scopeKey) ? [{ key, prefix, scopeKey }] : [];
    });
    if (!storage.getItem(ACCOUNT_WORKSPACE_BACKUP_KEY)) {
      storage.setItem(ACCOUNT_WORKSPACE_BACKUP_KEY, JSON.stringify(Object.fromEntries(
        [...legacy.map(({ key }) => key), LAST_WORKSPACE_SCOPE_KEY, ELECTRON_RECENT_NOTES_STORAGE_KEY]
          .map((key) => [key, storage.getItem(key)]),
      )));
    }
    for (const { key, prefix, scopeKey } of legacy) {
      const accountScopeKey = `${scopeKey}@${hackmdAccountId}`;
      const target = `${prefix}${accountScopeKey}`;
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(target) === null) {
        if (prefix === NOTE_WORKSPACE_PREFIX) {
          try {
            const layout = JSON.parse(value);
            // A layout names its scope and is dropped when that does not match where it is read.
            if (layout && typeof layout === 'object' && layout.scopeKey === scopeKey) {
              storage.setItem(target, JSON.stringify({ ...layout, scopeKey: accountScopeKey }));
            }
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
          }
        } else {
          storage.setItem(target, value);
        }
      }
      storage.removeItem(key);
    }
    const lastScope = storage.getItem(LAST_WORKSPACE_SCOPE_KEY);
    const accountLastScopeKey = getLastWorkspaceScopeKey(hackmdAccountId);
    if (lastScope !== null && storage.getItem(accountLastScopeKey) === null) storage.setItem(accountLastScopeKey, lastScope);
    const recent = storage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY);
    if (recent !== null) {
      let parsed: unknown;
      try { parsed = JSON.parse(recent); } catch { parsed = []; }
      storage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify(normalizeRecentNotes(parsed).map((note) => (
        note.teamPath !== LOCAL_VAULT_TEAM_PATH && !note.accountId ? { ...note, accountId: hackmdAccountId } : note
      ))));
    }
    storage.setItem(ACCOUNT_WORKSPACE_MIGRATION_KEY, hackmdAccountId);
  } catch {
    // Storage that cannot be read or written leaves the account starting with empty workspaces.
  }
}
