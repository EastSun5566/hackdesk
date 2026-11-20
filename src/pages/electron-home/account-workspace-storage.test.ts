import { afterEach, describe, expect, it } from 'vitest';

import { ELECTRON_RECENT_NOTES_STORAGE_KEY } from '@/lib/electron-recent-notes';
import {
  ACCOUNT_WORKSPACE_BACKUP_KEY,
  ACCOUNT_WORKSPACE_MIGRATION_KEY,
  getLastWorkspaceScopeKey,
  migrateAccountWorkspaceStorage,
} from './account-workspace-storage';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { LAST_WORKSPACE_SCOPE_KEY } from './ui-preferences';

describe('migrateAccountWorkspaceStorage', () => {
  afterEach(() => window.localStorage.clear());

  it('hands the shared HackMD workspaces to the account active at the update, once', () => {
    const storage = window.localStorage;
    const layout = { version: 3, scopeKey: 'personal', tabs: {}, panes: [] };
    storage.setItem('hackdesk_note_workspace:personal', JSON.stringify(layout));
    storage.setItem('hackdesk_note_workspace:team:design', JSON.stringify({ ...layout, scopeKey: 'team:design' }));
    storage.setItem('hackdesk_folder_expanded:team:design', '["folder-a"]');
    storage.setItem('hackdesk_note_finder:history', '{"query":"x"}');
    storage.setItem('hackdesk_note_workspace:local:vault-a', JSON.stringify({ ...layout, scopeKey: 'local:vault-a' }));
    storage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'team', label: 'Design', teamPath: 'design' }));
    storage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify([
      { noteId: 'a', teamPath: null, title: 'A', shortId: 'a', lastOpenedAtMillis: 2 },
      { noteId: 'b', teamPath: LOCAL_VAULT_TEAM_PATH, vaultId: 'vault-a', title: 'B', shortId: 'b', lastOpenedAtMillis: 1 },
    ]));

    migrateAccountWorkspaceStorage(storage, 'acct-1');

    expect(JSON.parse(storage.getItem('hackdesk_note_workspace:personal@acct-1')!)).toEqual({ ...layout, scopeKey: 'personal@acct-1' });
    expect(JSON.parse(storage.getItem('hackdesk_note_workspace:team:design@acct-1')!).scopeKey).toBe('team:design@acct-1');
    expect(storage.getItem('hackdesk_folder_expanded:team:design@acct-1')).toBe('["folder-a"]');
    expect(storage.getItem('hackdesk_note_finder:history@acct-1')).toBe('{"query":"x"}');
    expect(storage.getItem('hackdesk_note_workspace:personal')).toBeNull();
    // Local folders belong to no account.
    expect(storage.getItem('hackdesk_note_workspace:local:vault-a')).not.toBeNull();
    expect(storage.getItem(getLastWorkspaceScopeKey('acct-1'))).toBe(storage.getItem(LAST_WORKSPACE_SCOPE_KEY));
    expect(JSON.parse(storage.getItem(ELECTRON_RECENT_NOTES_STORAGE_KEY)!)).toEqual([
      expect.objectContaining({ noteId: 'a', accountId: 'acct-1' }),
      expect.not.objectContaining({ accountId: expect.anything() }),
    ]);
    expect(JSON.parse(storage.getItem(ACCOUNT_WORKSPACE_BACKUP_KEY)!)['hackdesk_note_workspace:personal']).toBe(JSON.stringify(layout));
    expect(storage.getItem(ACCOUNT_WORKSPACE_MIGRATION_KEY)).toBe('acct-1');

    // A second account starts empty instead of taking the first one's tabs.
    storage.setItem('hackdesk_note_workspace:personal', JSON.stringify(layout));
    migrateAccountWorkspaceStorage(storage, 'acct-2');
    expect(storage.getItem('hackdesk_note_workspace:personal@acct-2')).toBeNull();
  });
});
