import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { ELECTRON_RECENT_NOTES_STORAGE_KEY, readRecentNotes } from '@/lib/electron-recent-notes';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { createEmptyNoteWorkspaceState, openDraftNoteTab, readNoteWorkspaceLayoutStorage, writeNoteWorkspaceLayoutStorage } from './note-workspace';
import { LOCAL_WORKSPACE_BACKUP_KEY, LOCAL_WORKSPACE_MIGRATION_KEY, migrateLocalWorkspaceStorage } from './local-workspace-storage';

const snapshot = (vaultId = 'A'): LocalVaultSnapshot => ({ vaultId, rootPath: `/tmp/${vaultId}`, folders: [], notes: [] });
const layoutKey = (id: string) => `hackdesk_note_workspace:${id}`;

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('legacy Local workspace migration', () => {
  it('backs up exact bytes before copying layout, finder and folder states, once only', () => {
    const draft = openDraftNoteTab(createEmptyNoteWorkspaceState('local'), { content: 'Keep this draft' });
    writeNoteWorkspaceLayoutStorage(localStorage, draft);
    localStorage.setItem('hackdesk_note_finder:local', '{"query":"old search"}');
    localStorage.setItem('hackdesk_folder_collapsed:local', '["folder-one"]');
    const original = localStorage.getItem(layoutKey('local'));
    migrateLocalWorkspaceStorage(localStorage, snapshot());
    const restored = readNoteWorkspaceLayoutStorage(localStorage, 'local:A');
    expect(restored.tabs).toEqual(draft.tabs);
    expect(restored.drafts).toEqual(draft.drafts);
    expect(localStorage.getItem('hackdesk_note_finder:local:A')).toContain('old search');
    expect(localStorage.getItem('hackdesk_folder_collapsed:local:A')).toBe('["folder-one"]');
    expect(JSON.parse(localStorage.getItem(LOCAL_WORKSPACE_BACKUP_KEY)!)[layoutKey('local')]).toBe(original);
    expect(localStorage.getItem(layoutKey('local'))).toBe(original);
    migrateLocalWorkspaceStorage(localStorage, snapshot('B'));
    expect(localStorage.getItem(layoutKey('local:B'))).toBeNull();
    expect(localStorage.getItem(LOCAL_WORKSPACE_MIGRATION_KEY)).toBe('A');
  });

  it('does not overwrite existing destination data', () => {
    localStorage.setItem(layoutKey('local'), '{"version":2,"scopeKey":"local"}');
    localStorage.setItem(layoutKey('local:A'), 'existing data');
    migrateLocalWorkspaceStorage(localStorage, snapshot());
    expect(localStorage.getItem(layoutKey('local:A'))).toBe('existing data');
    expect(localStorage.getItem(LOCAL_WORKSPACE_MIGRATION_KEY)).toBe('A');
  });

  it('keeps the original backup and retries after a partial write failure', () => {
    writeNoteWorkspaceLayoutStorage(localStorage, openDraftNoteTab(createEmptyNoteWorkspaceState('local'), { content: 'Original' }));
    localStorage.setItem('hackdesk_note_finder:local', '{"query":"saved"}');
    const setItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'hackdesk_note_finder:local:A') throw new Error('Storage full');
      setItem.call(this, key, value);
    });
    expect(() => migrateLocalWorkspaceStorage(localStorage, snapshot())).toThrow('Storage full');
    const backup = localStorage.getItem(LOCAL_WORKSPACE_BACKUP_KEY);
    expect(backup).not.toBeNull();
    expect(localStorage.getItem(LOCAL_WORKSPACE_MIGRATION_KEY)).toBeNull();
    spy.mockRestore();
    migrateLocalWorkspaceStorage(localStorage, snapshot());
    expect(localStorage.getItem(LOCAL_WORKSPACE_BACKUP_KEY)).toBe(backup);
    expect(localStorage.getItem('hackdesk_note_finder:local:A')).toContain('saved');
    expect(localStorage.getItem(LOCAL_WORKSPACE_MIGRATION_KEY)).toBe('A');
  });

  it('assigns only recent note IDs confirmed in the snapshot; keeps unknown records', () => {
    const entries = ['known', 'unknown'].map((noteId) => ({ noteId, teamPath: LOCAL_VAULT_TEAM_PATH, title: noteId, shortId: noteId, lastOpenedAtMillis: 1 }));
    localStorage.setItem(ELECTRON_RECENT_NOTES_STORAGE_KEY, JSON.stringify(entries));
    const current = snapshot();
    current.notes = [{ id: 'known' } as LocalVaultSnapshot['notes'][number]];
    migrateLocalWorkspaceStorage(localStorage, current);
    expect(readRecentNotes(localStorage)).toEqual([{ ...entries[0], vaultId: 'A' }, entries[1]]);
  });
});
