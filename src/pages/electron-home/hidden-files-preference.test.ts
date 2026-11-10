import { describe, expect, it } from 'vitest';
import { isHiddenLocalPath } from './hidden-files-preference';
import { adaptLocalVaultSnapshot } from './local-vault-adapter';
import type { LocalVaultSnapshot } from '@/lib/local-vault';

describe('hidden local paths', () => {
  it('hides dotfiles and descendants of dotfolders, but not ordinary names', () => {
    expect(isHiddenLocalPath('notes/.draft.md')).toBe(true);
    expect(isHiddenLocalPath('.private/note.md')).toBe(true);
    expect(isHiddenLocalPath('notes/v1.2.md')).toBe(false);
    const snapshot: LocalVaultSnapshot = {
      vaultId: 'vault', rootPath: '/vault',
      folders: [{ id: 'visible', name: 'visible', relativePath: 'visible', parentPath: null, createdAtMillis: null, updatedAtMillis: null }, { id: 'hidden', name: '.hidden', relativePath: '.hidden', parentPath: null, createdAtMillis: null, updatedAtMillis: null }],
      notes: [],
    };
    expect(adaptLocalVaultSnapshot(snapshot, false).folders.map((folder) => folder.id)).toEqual(['visible']);
    expect(adaptLocalVaultSnapshot(snapshot, true).folders).toHaveLength(2);
  });
});
