import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, HackDeskElectronAPI } from '@/lib/electron-api';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';
import type { LocalDocument, LocalFolder, LocalVaultSnapshot } from '@/lib/local-vault';

import { toDocumentSummary, toFolderSummary } from './local-vault-adapter';
import type { WorkspaceScope } from './types';
import { useElectronNoteMutations } from './useElectronNoteMutations';

/**
 * Characterization of which backend call each workspace operation makes in each kind of workspace.
 * It pins today's behaviour, quirks included, so the operations can move behind adapters (#106)
 * without changing what reaches Local Vault or HackMD.
 */

vi.mock('@/components/ui/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const SCOPES = {
  local: { type: 'local', label: 'Local Vault', vaultId: 'vault-1' },
  personal: { type: 'personal', label: 'My Workspace' },
  team: { type: 'team', label: 'Team A', teamPath: 'team-a' },
  history: { type: 'history', label: 'Recent' },
} satisfies Record<string, WorkspaceScope>;

type ScopeName = keyof typeof SCOPES;
type Call = [method: string, ...args: unknown[]];

function remoteDocument(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: '# Source',
    createdAtMillis: 1,
    description: 'About the source',
    folderPaths: [{ id: 'folder-9', name: 'Projects', icon: null, color: null, parentId: null, clientId: null }],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'signed_in',
    shortId: 'note-1',
    tags: ['plan'],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Source',
    titleUpdatedAtMillis: null,
    updatedAtMillis: 1,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

function localDocument(overrides: Partial<LocalDocument> = {}): LocalDocument {
  return {
    content: '# Source',
    createdAtMillis: 1,
    id: 'local-source',
    parentPath: 'Projects',
    relativePath: 'Projects/Source.md',
    revision: { contentHash: 'hash-1', mtimeMs: 1 },
    title: 'Source',
    updatedAtMillis: 1,
    ...overrides,
  };
}

const LOCAL_FOLDER: LocalFolder = {
  id: 'local-folder:Templates',
  name: 'Templates',
  relativePath: 'Templates',
  parentPath: null,
  createdAtMillis: null,
  updatedAtMillis: null,
};

function snapshotOf(document: LocalDocument): LocalVaultSnapshot {
  return { vaultId: 'vault-1', rootPath: '/tmp/vault', folders: [], notes: [document] };
}

const LOCAL_NOTE = toDocumentSummary(localDocument(), snapshotOf(localDocument()));
const PERSONAL_NOTE = remoteDocument();
const TEAM_NOTE = remoteDocument({ id: 'team-note-1', teamPath: 'team-a' });

/**
 * An Electron API that records every call as [`namespace.method`, ...args] and answers with a
 * plausible value for the method, so each operation runs to completion.
 */
function createRecordingApi() {
  const calls: Call[] = [];
  const createdLocal = localDocument({ id: 'local-new', title: 'New', relativePath: 'Projects/New.md' });
  const snapshot = snapshotOf(createdLocal);
  const remoteFolder = { ...toFolderSummary(LOCAL_FOLDER), id: 'folder-new' };
  const responses: Record<string, (...args: unknown[]) => unknown> = {
    'localVault.readNote': () => localDocument(),
    'localVault.createNote': () => ({ document: createdLocal, snapshot }),
    'localVault.writeNote': () => ({ document: createdLocal, snapshot }),
    'localVault.moveNote': () => ({ document: createdLocal, snapshot }),
    'localVault.createFolder': () => ({ folder: LOCAL_FOLDER, snapshot }),
    'localVault.renameFolder': () => ({ folder: LOCAL_FOLDER, snapshot }),
    'localVault.trashNote': () => snapshot,
    'localVault.trashFolder': () => snapshot,
    'localVault.moveFolder': () => snapshot,
    'localVault.importAttachment': () => ({ attachment: { link: 'attachments/image.png' }, snapshot }),
    'hackmd.getNote': (id, teamPath) => ({ source: 'remote', data: remoteDocument({ id: id as string, teamPath: teamPath as string | null }) }),
    'hackmd.createNote': () => remoteDocument({ id: 'note-new' }),
    'hackmd.createTeamNote': () => remoteDocument({ id: 'note-new', teamPath: 'team-a' }),
    'hackmd.updateNote': (id) => remoteDocument({ id: id as string }),
    'hackmd.updateTeamNote': (teamPath, id) => remoteDocument({ id: id as string, teamPath: teamPath as string }),
    'hackmd.createFolder': () => remoteFolder,
    'hackmd.createTeamFolder': () => remoteFolder,
    'hackmd.updateFolder': () => remoteFolder,
    'hackmd.updateTeamFolder': () => remoteFolder,
    'hackmd.updateFolderOrder': (order) => order,
    'hackmd.updateTeamFolderOrder': (_teamPath, order) => order,
    'hackmd.uploadNoteImage': () => ({ link: 'https://hackmd.io/_uploads/image.png' }),
  };
  const namespace = (name: string) => new Proxy({}, {
    get: (_target, method) => {
      // cancelRequest is optional on the bridge; leaving it out keeps uploads on the plain path.
      if (typeof method !== 'string' || method === 'then' || method === 'cancelRequest') return undefined;
      return async (...args: unknown[]) => {
        calls.push([`${name}.${method}`, ...args]);
        return responses[`${name}.${method}`]?.(...args);
      };
    },
  });
  const api = {
    localVault: namespace('localVault'),
    hackmd: namespace('hackmd'),
    settings: namespace('settings'),
  } as unknown as HackDeskElectronAPI;
  return { api, calls };
}

type Mutations = ReturnType<typeof useElectronNoteMutations>;

/** Runs one operation in a fresh workspace and returns the backend calls it made, and its error. */
async function record<TVariables>(
  scope: ScopeName,
  pick: (mutations: Mutations) => { mutateAsync: (variables: TVariables) => Promise<unknown> },
  variables: TVariables,
  { selectedParentFolderId }: { selectedParentFolderId?: string } = {},
) {
  const { api, calls } = createRecordingApi();
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const { result } = renderHook(() => useElectronNoteMutations({
    api,
    scope: SCOPES[scope],
    selectedNote: null,
    selectedParentFolderId,
    onSettingsSaved: vi.fn(),
    onNoteCreated: vi.fn(),
    onDraftNoteCreated: vi.fn(),
    onNoteSaved: vi.fn(),
    onFolderCreated: vi.fn(),
    onFolderRenamed: vi.fn(),
    onFolderDeleted: vi.fn(),
    onNoteDeleted: vi.fn(),
    onNoteMoved: vi.fn(),
  }), { wrapper: Wrapper });

  let error: string | undefined;
  await act(async () => {
    try {
      await pick(result.current).mutateAsync(variables);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  });
  return error === undefined ? { calls } : { calls, error };
}

const PARENT = { local: 'local-folder:Projects', remote: 'folder-1' };

describe('workspace operations by workspace kind', () => {
  it('create-note: a quick note in the selected folder', async () => {
    const content = '# Plan\n\n';
    const create = (m: Mutations) => m.createNoteMutation;
    expect(await record('local', create, 'Plan', { selectedParentFolderId: PARENT.local })).toEqual({
      calls: [['localVault.createNote', { title: 'Plan', content, parentPath: 'Projects' }]],
    });
    expect(await record('personal', create, 'Plan', { selectedParentFolderId: PARENT.remote })).toEqual({
      calls: [['hackmd.createNote', { title: 'Plan', content, parentFolderId: 'folder-1' }]],
    });
    expect(await record('team', create, 'Plan')).toEqual({
      calls: [['hackmd.createTeamNote', 'team-a', { title: 'Plan', content }]],
    });
    // History has no guard here: the note lands in My Workspace.
    expect(await record('history', create, 'Plan')).toEqual({
      calls: [['hackmd.createNote', { title: 'Plan', content }]],
    });
  });

  it('create-draft: saves a draft as a new note', async () => {
    const create = (m: Mutations) => m.createDraftNoteMutation;
    const draft = { tabId: 'tab-1', input: { title: 'Untitled', content: '# Captured\nBody' } };
    const input = { title: 'Captured', content: '# Captured\nBody' };
    expect(await record('local', create, draft, { selectedParentFolderId: PARENT.local })).toEqual({
      calls: [['localVault.createNote', { ...input, parentPath: 'Projects' }]],
    });
    expect(await record('personal', create, draft, { selectedParentFolderId: PARENT.remote })).toEqual({
      calls: [['hackmd.createNote', { ...input, parentFolderId: 'folder-1' }]],
    });
    expect(await record('team', create, draft)).toEqual({
      calls: [['hackmd.createTeamNote', 'team-a', input]],
    });
    expect(await record('history', create, draft)).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before creating notes.',
    });
  });

  it('duplicate-note: copies the note next to the original', async () => {
    const duplicate = (m: Mutations) => m.duplicateNoteMutation;
    expect(await record('local', duplicate, LOCAL_NOTE)).toEqual({
      calls: [
        ['localVault.readNote', 'local-source'],
        ['localVault.createNote', { title: 'Copy of Source', content: '# Source', parentPath: 'Projects' }],
      ],
    });
    const copy = {
      title: 'Copy of Source',
      content: '# Source',
      description: 'About the source',
      tags: ['plan'],
      readPermission: 'signed_in',
      writePermission: 'owner',
      parentFolderId: 'folder-9',
    };
    expect(await record('personal', duplicate, PERSONAL_NOTE)).toEqual({
      calls: [['hackmd.getNote', 'note-1', null], ['hackmd.createNote', copy]],
    });
    expect(await record('team', duplicate, TEAM_NOTE)).toEqual({
      calls: [['hackmd.getNote', 'team-note-1', 'team-a'], ['hackmd.createTeamNote', 'team-a', copy]],
    });
    expect(await record('history', duplicate, PERSONAL_NOTE)).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before duplicating notes.',
    });
  });

  it('save-as-template: creates the Templates folder when it is missing', async () => {
    const save = (m: Mutations) => m.saveAsTemplateMutation;
    const missing = { title: 'Weekly', content: '# Weekly', templatesFolderId: null };
    const note = { title: 'Weekly', content: '# Weekly' };
    expect(await record('local', save, missing)).toEqual({
      calls: [
        ['localVault.createFolder', { name: 'Templates', parentPath: null }],
        ['localVault.createNote', { ...note, parentPath: 'Templates' }],
      ],
    });
    expect(await record('local', save, { ...missing, templatesFolderId: 'local-folder:Templates' })).toEqual({
      calls: [['localVault.createNote', { ...note, parentPath: 'Templates' }]],
    });
    expect(await record('personal', save, missing)).toEqual({
      calls: [
        ['hackmd.createFolder', { name: 'Templates' }],
        ['hackmd.createNote', { ...note, parentFolderId: 'folder-new' }],
      ],
    });
    expect(await record('team', save, missing)).toEqual({
      calls: [
        ['hackmd.createTeamFolder', 'team-a', { name: 'Templates' }],
        ['hackmd.createTeamNote', 'team-a', { ...note, parentFolderId: 'folder-new' }],
      ],
    });
    expect(await record('personal', save, { ...missing, templatesFolderId: 'folder-t' })).toEqual({
      calls: [['hackmd.createNote', { ...note, parentFolderId: 'folder-t' }]],
    });
    expect(await record('history', save, missing)).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before saving templates.',
    });
  });

  it('import-note: imports into the folder the import names', async () => {
    const importNote = (m: Mutations) => m.importMarkdownNoteMutation;
    // The import command puts the selected folder in the input (buildMarkdownImportInput).
    const input = { title: 'Imported', content: '# Imported' };
    expect(await record('local', importNote, { ...input, parentFolderId: PARENT.local })).toEqual({
      calls: [['localVault.createNote', { ...input, parentPath: 'Projects' }]],
    });
    expect(await record('personal', importNote, { ...input, parentFolderId: PARENT.remote })).toEqual({
      calls: [['hackmd.createNote', { ...input, parentFolderId: 'folder-1' }]],
    });
    expect(await record('team', importNote, input)).toEqual({
      calls: [['hackmd.createTeamNote', 'team-a', input]],
    });
    expect(await record('history', importNote, input)).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before importing notes.',
    });
  });

  it('create-folder: creates a folder in the selected folder', async () => {
    const create = (m: Mutations) => m.createFolderMutation;
    expect(await record('local', create, { name: 'Specs' }, { selectedParentFolderId: PARENT.local })).toEqual({
      calls: [['localVault.createFolder', { name: 'Specs', parentPath: 'Projects' }]],
    });
    expect(await record('personal', create, { name: 'Specs' }, { selectedParentFolderId: PARENT.remote })).toEqual({
      calls: [['hackmd.createFolder', { name: 'Specs', parentFolderId: 'folder-1' }]],
    });
    expect(await record('team', create, { name: 'Specs' })).toEqual({
      calls: [['hackmd.createTeamFolder', 'team-a', { name: 'Specs' }]],
    });
    expect(await record('history', create, { name: 'Specs' })).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before creating a folder.',
    });
  });

  it('rename-folder: trims the name and requires one', async () => {
    const rename = (m: Mutations) => m.renameFolderMutation;
    expect(await record('local', rename, { folderId: 'local-folder:Projects', input: { name: ' Plans ' } })).toEqual({
      calls: [['localVault.renameFolder', { relativePath: 'Projects', name: 'Plans' }]],
    });
    expect(await record('personal', rename, { folderId: 'folder-1', input: { name: ' Plans ' } })).toEqual({
      calls: [['hackmd.updateFolder', 'folder-1', { name: 'Plans' }]],
    });
    expect(await record('team', rename, { folderId: 'folder-1', input: { name: 'Plans' } })).toEqual({
      calls: [['hackmd.updateTeamFolder', 'team-a', 'folder-1', { name: 'Plans' }]],
    });
    expect(await record('history', rename, { folderId: 'folder-1', input: { name: 'Plans' } })).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before changing folders.',
    });
    expect(await record('personal', rename, { folderId: 'folder-1', input: { name: '  ' } })).toEqual({
      calls: [],
      error: 'Folder name is required.',
    });
  });

  it('delete-folder: moves a local folder to the trash and deletes a remote one', async () => {
    const remove = (m: Mutations) => m.deleteFolderMutation;
    expect(await record('local', remove, { folderId: 'local-folder:Projects', parentFolderId: null })).toEqual({
      calls: [['localVault.trashFolder', { relativePath: 'Projects' }]],
    });
    expect(await record('personal', remove, { folderId: 'folder-1', parentFolderId: null })).toEqual({
      calls: [['hackmd.deleteFolder', 'folder-1']],
    });
    expect(await record('team', remove, { folderId: 'folder-1', parentFolderId: null })).toEqual({
      calls: [['hackmd.deleteTeamFolder', 'team-a', 'folder-1']],
    });
    expect(await record('history', remove, { folderId: 'folder-1', parentFolderId: null })).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before deleting folders.',
    });
  });

  it('move-folder: reparents, then reorders where the workspace keeps an order', async () => {
    const move = (m: Mutations) => m.moveFolderMutation;
    const order = { root: ['folder-2', 'folder-1'] };
    const operation: FolderDropOperation = {
      folderId: 'folder-1',
      parentFolderId: 'folder-2',
      order,
      parentChanged: true,
      orderChanged: true,
      changed: true,
    };
    expect(await record('local', move, {
      ...operation,
      folderId: 'local-folder:Projects',
      parentFolderId: 'local-folder:Archive',
    })).toEqual({
      calls: [['localVault.moveFolder', { relativePath: 'Projects', parentPath: 'Archive' }]],
    });
    expect(await record('personal', move, operation)).toEqual({
      calls: [
        ['hackmd.updateFolder', 'folder-1', { parentFolderId: 'folder-2' }],
        ['hackmd.updateFolderOrder', order],
      ],
    });
    expect(await record('team', move, { ...operation, parentChanged: false })).toEqual({
      calls: [['hackmd.updateTeamFolderOrder', 'team-a', order]],
    });
    expect(await record('history', move, operation)).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before changing folders.',
    });
    expect(await record('personal', move, { ...operation, changed: false })).toEqual({ calls: [] });
  });

  it('move-note: checks the local revision, or updates the remote parent folder', async () => {
    const move = (m: Mutations) => m.moveNoteMutation;
    expect(await record('local', move, { note: LOCAL_NOTE, targetFolderId: 'local-folder:Archive' })).toEqual({
      calls: [
        ['localVault.readNote', 'local-source'],
        ['localVault.moveNote', {
          noteId: 'local-source',
          parentPath: 'Archive',
          expectedRevision: { contentHash: 'hash-1', mtimeMs: 1 },
        }],
      ],
    });
    expect(await record('personal', move, { note: PERSONAL_NOTE, targetFolderId: null })).toEqual({
      calls: [['hackmd.updateNote', 'note-1', { parentFolderId: null }]],
    });
    expect(await record('team', move, { note: TEAM_NOTE, targetFolderId: 'folder-2' })).toEqual({
      calls: [['hackmd.updateTeamNote', 'team-a', 'team-note-1', { parentFolderId: 'folder-2' }]],
    });
    expect(await record('history', move, { note: PERSONAL_NOTE, targetFolderId: null })).toEqual({
      calls: [],
      error: 'Choose My Workspace or a team before moving notes.',
    });
  });

  it('update-note: routes by the note, not by the workspace being shown', async () => {
    const update = (m: Mutations) => m.updateNoteMutation;
    const content = { input: { content: '# Edited' }, intent: 'content' as const };
    expect(await record('local', update, { note: LOCAL_NOTE, ...content })).toEqual({
      calls: [['localVault.writeNote', {
        noteId: 'local-source',
        content: '# Edited',
        expectedRevision: { contentHash: 'hash-1', mtimeMs: 1 },
      }]],
    });
    // A local note open while another workspace is shown still saves to disk.
    expect((await record('personal', update, { note: LOCAL_NOTE, ...content })).calls.map(([method]) => method))
      .toEqual(['localVault.writeNote']);
    // Content saves first check HackMD for newer changes.
    expect(await record('personal', update, { note: PERSONAL_NOTE, ...content })).toEqual({
      calls: [['hackmd.getNote', 'note-1', null], ['hackmd.updateNote', 'note-1', { content: '# Edited' }]],
    });
    expect(await record('history', update, { note: TEAM_NOTE, ...content })).toEqual({
      calls: [
        ['hackmd.getNote', 'team-note-1', 'team-a'],
        ['hackmd.updateTeamNote', 'team-a', 'team-note-1', { content: '# Edited' }],
      ],
    });
    // Metadata-only updates skip the check, and an empty title becomes Untitled.
    expect(await record('team', update, { note: TEAM_NOTE, input: { title: '  ' }, intent: 'metadata' })).toEqual({
      calls: [['hackmd.updateTeamNote', 'team-a', 'team-note-1', { title: 'Untitled' }]],
    });
  });

  it('upload-image: stores local attachments on disk and remote images on HackMD', async () => {
    const upload = (m: Mutations) => m.uploadNoteImageMutation;
    const input = { fileName: 'image.png', mimeType: 'image/png', bytes: new ArrayBuffer(1) };
    expect(await record('local', upload, { note: LOCAL_NOTE, input })).toEqual({
      calls: [['localVault.importAttachment', { noteId: 'local-source', ...input }]],
    });
    expect(await record('personal', upload, { note: LOCAL_NOTE, input })).toEqual({
      calls: [['localVault.importAttachment', { noteId: 'local-source', ...input }]],
    });
    expect(await record('team', upload, { note: TEAM_NOTE, input })).toEqual({
      calls: [['hackmd.uploadNoteImage', 'team-note-1', input]],
    });
    expect(await record('history', upload, { note: PERSONAL_NOTE, input })).toEqual({
      calls: [['hackmd.uploadNoteImage', 'note-1', input]],
    });
  });

  it('delete-note: trashes a local note and deletes a remote one where it lives', async () => {
    const remove = (m: Mutations) => m.deleteNoteMutation;
    expect(await record('local', remove, LOCAL_NOTE)).toEqual({
      calls: [['localVault.trashNote', { noteId: 'local-source' }]],
    });
    expect(await record('personal', remove, LOCAL_NOTE)).toEqual({
      calls: [['localVault.trashNote', { noteId: 'local-source' }]],
    });
    expect(await record('personal', remove, PERSONAL_NOTE)).toEqual({
      calls: [['hackmd.deleteNote', 'note-1']],
    });
    expect(await record('team', remove, TEAM_NOTE)).toEqual({
      calls: [['hackmd.deleteTeamNote', 'team-a', 'team-note-1']],
    });
    expect(await record('history', remove, TEAM_NOTE)).toEqual({
      calls: [['hackmd.deleteTeamNote', 'team-a', 'team-note-1']],
    });
  });
});
