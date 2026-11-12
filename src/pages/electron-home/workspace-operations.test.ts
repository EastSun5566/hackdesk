import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, HackDeskElectronAPI } from '@/lib/electron-api';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';

import { toDocumentSummary } from './local-vault-adapter';
import type { WorkspaceScope } from './types';
import { getNoteOperations, getWorkspaceCapabilities, getWorkspaceOperations, isLocalVaultNote } from './workspace-operations';

const document: LocalDocument = {
  content: '# Note',
  createdAtMillis: 1,
  id: 'local-1',
  parentPath: null,
  relativePath: 'Note.md',
  revision: { contentHash: 'hash-1', mtimeMs: 1 },
  title: 'Note',
  updatedAtMillis: 1,
};
const snapshot: LocalVaultSnapshot = { vaultId: 'vault-1', rootPath: '/tmp/vault', folders: [], notes: [document] };
const localNote = toDocumentSummary(document, snapshot);

const scopes = {
  local: { type: 'local', label: 'Local Vault' },
  personal: { type: 'personal', label: 'My Workspace' },
  team: { type: 'team', label: 'Team A', teamPath: 'team-a' },
  history: { type: 'history', label: 'Recent' },
} satisfies Record<string, WorkspaceScope>;

function createApi(responses: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const namespace = (name: string) => {
    const methods = new Map<string, ReturnType<typeof vi.fn>>();
    return new Proxy({}, {
      get: (_target, method) => {
        if (typeof method !== 'string' || method === 'then' || method === 'cancelRequest') return undefined;
        if (!methods.has(method)) {
          methods.set(method, vi.fn(async () => {
            calls.push(`${name}.${method}`);
            return responses[`${name}.${method}`];
          }));
        }
        return methods.get(method);
      },
    });
  };
  const api = { localVault: namespace('localVault'), hackmd: namespace('hackmd') } as unknown as HackDeskElectronAPI;
  return { api, calls };
}

const move = (overrides: Partial<FolderDropOperation>): FolderDropOperation => ({
  folderId: 'folder-1',
  parentFolderId: null,
  order: {},
  parentChanged: false,
  orderChanged: false,
  changed: true,
  ...overrides,
});

describe('getNoteOperations', () => {
  it('keeps a Local Vault note on disk whatever workspace is shown', async () => {
    expect(isLocalVaultNote(scopes.team, localNote)).toBe(true);
    expect(isLocalVaultNote(scopes.team, { teamPath: 'team-a' })).toBe(false);
    expect(isLocalVaultNote(scopes.local, { teamPath: null })).toBe(true);

    const { api, calls } = createApi({ 'localVault.trashNote': snapshot });
    const cacheSnapshot = vi.fn();
    await getNoteOperations(api, scopes.team, localNote, cacheSnapshot).deleteNote(localNote);
    expect(calls).toEqual(['localVault.trashNote']);
    expect(cacheSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('says which saves check HackMD for newer changes first', () => {
    const { api } = createApi();
    expect(getNoteOperations(api, scopes.personal, localNote, vi.fn()).checksRemoteChanges).toBe(false);
    expect(getNoteOperations(api, scopes.personal, { teamPath: null }, vi.fn()).checksRemoteChanges).toBe(true);
  });

  it('offers Undo only for personal HackMD notes, which go to a trash they can come back from', () => {
    const { api } = createApi();
    const restores = (scope: WorkspaceScope, note: { teamPath: string | null }) => (
      getNoteOperations(api, scope, note, vi.fn()).restoresFromTrash
    );
    expect(restores(scopes.personal, { teamPath: null })).toBe(true);
    expect(restores(scopes.history, { teamPath: null })).toBe(true);
    expect(restores(scopes.history, { teamPath: 'team-a' })).toBe(false);
    expect(restores(scopes.personal, localNote)).toBe(false);
    expect(restores(scopes.local, { teamPath: null })).toBe(false);
  });

  it('does not write a local note when neither its title nor its content changed', async () => {
    const { api, calls } = createApi();
    const operations = getNoteOperations(api, scopes.local, localNote, vi.fn());
    await expect(operations.saveNote(localNote, { title: 'Note' })).resolves.toBe(localNote);
    await expect(operations.saveNote(localNote, { title: 'Renamed' }, { baseTitle: 'Renamed' })).resolves.toBe(localNote);
    expect(calls).toEqual([]);
  });
});

describe('getWorkspaceCapabilities', () => {
  it.each([
    ['local', { listsFromSnapshot: true, hasFolders: true }],
    ['personal', { listsFromSnapshot: false, hasFolders: true }],
    ['team', { listsFromSnapshot: false, hasFolders: true }],
    ['history', { listsFromSnapshot: false, hasFolders: false }],
  ] as const)('%s', (scope, expected) => {
    expect(getWorkspaceCapabilities(scopes[scope])).toEqual(expected);
  });
});

describe('getWorkspaceOperations', () => {
  it('does not touch disk when a local folder only changes order', async () => {
    const { api, calls } = createApi();
    await getWorkspaceOperations(api, scopes.local, vi.fn()).moveFolder(move({ orderChanged: true, order: { root: ['a'] } }));
    expect(calls).toEqual([]);
  });

  it('refuses each History change with its own reason', async () => {
    const { api, calls } = createApi();
    const history = getWorkspaceOperations(api, scopes.history, vi.fn());
    await expect(history.moveFolder(move({ orderChanged: true }))).rejects.toThrow('before changing folder order.');
    await expect(history.moveFolder(move({ parentChanged: true, orderChanged: true }))).rejects.toThrow('before changing folders.');
    await expect(history.moveFolder(move({}))).resolves.toBeUndefined();
    await expect(history.saveTemplate({ title: 'T', content: '', templatesFolderId: 'f' })).rejects.toThrow('before saving templates.');
    expect(calls).toEqual([]);
  });

  it('fails a duplicate when HackMD cannot read the original', async () => {
    const { api, calls } = createApi({ 'hackmd.getNote': { source: 'error', error: 'Note not found.' } });
    const note = { id: 'note-1', teamPath: 'team-a' } as DocumentSummary;
    await expect(getWorkspaceOperations(api, scopes.team, vi.fn()).duplicateNote(note)).rejects.toThrow('Note not found.');
    expect(calls).toEqual(['hackmd.getNote']);
  });

  it('puts a template in the Local Vault folder it just created', async () => {
    const folder = {
      id: 'local-folder:Templates', name: 'Templates', relativePath: 'Templates', parentPath: null, createdAtMillis: null, updatedAtMillis: null,
    };
    const { api } = createApi({
      'localVault.createFolder': { folder, snapshot },
      'localVault.createNote': { document, snapshot },
    });
    await getWorkspaceOperations(api, scopes.local, vi.fn()).saveTemplate({ title: 'T', content: 'c', templatesFolderId: null });
    expect(api.localVault.createNote).toHaveBeenCalledWith({ title: 'T', content: 'c', parentPath: 'Templates' });
  });

  it('creates notes in the team the workspace shows, not the note it copies', async () => {
    const source = { id: 'note-1', teamPath: null } as DocumentSummary;
    const { api } = createApi({
      'hackmd.getNote': { source: 'remote', data: { title: 'A', content: '', description: '', tags: [], folderPaths: [] } },
    });
    await getWorkspaceOperations(api, scopes.team, vi.fn()).duplicateNote(source);
    expect(api.hackmd.getNote).toHaveBeenCalledWith('note-1', null);
    expect(api.hackmd.createTeamNote).toHaveBeenCalledWith('team-a', expect.objectContaining({ title: 'Copy of A' }));
  });
});
