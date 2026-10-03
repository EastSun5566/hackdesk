import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/toast';
import type { DocumentSummary, ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { deriveDraftNoteTitle, useElectronNoteMutations } from './useElectronNoteMutations';
import type { WorkspaceScope } from './types';
import { getFoldersQueryKey, getWorkspaceQueryKey } from './repository';

vi.mock('@/components/ui/toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function createDocument(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: overrides.content ?? '# Draft',
    createdAtMillis: 1,
    description: '',
    folderPaths: [],
    id: overrides.id ?? 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-1',
    tags: [],
    tagsUpdatedAtMillis: null,
    teamPath: overrides.teamPath ?? null,
    title: overrides.title ?? 'Draft',
    titleUpdatedAtMillis: null,
    updatedAtMillis: 1,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

function createLocalDocument(overrides: Partial<LocalDocument> = {}): LocalDocument {
  return {
    content: '# Local draft',
    createdAtMillis: 1,
    id: 'local-note-1',
    parentPath: null,
    relativePath: 'Local draft.md',
    revision: { contentHash: 'hash-1', mtimeMs: 1 },
    title: 'Local draft',
    updatedAtMillis: 1,
    ...overrides,
  };
}

function createSnapshot(document = createLocalDocument()): LocalVaultSnapshot {
  return {
    vaultId: 'vault-1',
    rootPath: '/tmp/vault',
    folders: [],
    notes: [document],
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

function createOptions({
  api,
  scope,
  onDraftNoteCreated = vi.fn(),
  onFolderCreated = vi.fn(),
  onFolderRenamed = vi.fn(),
  selectedParentFolderId,
}: {
  api: HackDeskElectronAPI;
  scope: WorkspaceScope;
  onDraftNoteCreated?: (tabId: string, note: DocumentSummary) => void;
  onFolderCreated?: ReturnType<typeof vi.fn>;
  onFolderRenamed?: ReturnType<typeof vi.fn>;
  selectedParentFolderId?: string;
}) {
  return {
    api,
    scope,
    selectedNote: null,
    selectedParentFolderId,
    onSettingsSaved: vi.fn(),
    onNoteCreated: vi.fn(),
    onDraftNoteCreated,
    onNoteSaved: vi.fn(),
    onFolderCreated,
    onFolderRenamed,
    onFolderDeleted: vi.fn(),
    onNoteDeleted: vi.fn(),
    onNoteMoved: vi.fn(),
  };
}

describe('deriveDraftNoteTitle', () => {
  it('uses explicit title, then first content heading or line, then Untitled', () => {
    expect(deriveDraftNoteTitle({ title: '  Sprint Plan ', content: '# Ignored' })).toBe('Sprint Plan');
    expect(deriveDraftNoteTitle({ title: 'Untitled', content: '# Capture title\nBody' })).toBe('Capture title');
    expect(deriveDraftNoteTitle({ title: '', content: '  first line  \nsecond' })).toBe('first line');
    expect(deriveDraftNoteTitle({ title: '', content: '' })).toBe('Untitled');
  });
});

describe('useElectronNoteMutations draft save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a personal HackMD note from a draft and reports the source tab', async () => {
    const created = createDocument({ id: 'personal-note', title: 'Capture title' });
    const api = {
      hackmd: {
        createNote: vi.fn(async () => created),
      },
    } as unknown as HackDeskElectronAPI;
    const onDraftNoteCreated = vi.fn();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api,
      scope: { type: 'personal', label: 'My Workspace' },
      onDraftNoteCreated,
    })), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createDraftNoteMutation.mutateAsync({
        tabId: 'draft-tab-1',
        input: { title: 'Untitled', content: '# Capture title\nBody' },
      });
    });

    expect(api.hackmd.createNote).toHaveBeenCalledWith({
      title: 'Capture title',
      content: '# Capture title\nBody',
    });
    expect(onDraftNoteCreated).toHaveBeenCalledWith('draft-tab-1', created, { title: 'Untitled', content: '# Capture title\nBody' });
    expect(toast.success).toHaveBeenCalledWith('Note saved.');
  });

  it('creates a team HackMD note from a draft', async () => {
    const created = createDocument({ id: 'team-note', teamPath: 'team-a', title: 'Team draft' });
    const api = {
      hackmd: {
        createTeamNote: vi.fn(async () => created),
      },
    } as unknown as HackDeskElectronAPI;
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api,
      scope: { type: 'team', label: 'Team A', teamPath: 'team-a' },
    })), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createDraftNoteMutation.mutateAsync({
        tabId: 'draft-tab-1',
        input: { title: 'Team draft', content: 'Body' },
      });
    });

    expect(api.hackmd.createTeamNote).toHaveBeenCalledWith('team-a', {
      title: 'Team draft',
      content: 'Body',
    });
  });

  it('creates a local vault note from a draft', async () => {
    const createdLocalDocument = createLocalDocument({
      id: 'local-note',
      title: 'Local draft',
      relativePath: 'Local draft.md',
    });
    const snapshot = createSnapshot(createdLocalDocument);
    const api = {
      localVault: {
        createNote: vi.fn(async () => ({ document: createdLocalDocument, snapshot })),
        getSnapshot: vi.fn(),
      },
    } as unknown as HackDeskElectronAPI;
    const onDraftNoteCreated = vi.fn();
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api,
      scope: { type: 'local', label: 'Local Vault' },
      onDraftNoteCreated,
    })), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createDraftNoteMutation.mutateAsync({
        tabId: 'draft-tab-1',
        input: { title: 'Local draft', content: '# Local draft' },
      });
    });

    expect(api.localVault.createNote).toHaveBeenCalledWith({
      title: 'Local draft',
      content: '# Local draft',
      parentPath: null,
    });
    await waitFor(() => {
      expect(onDraftNoteCreated).toHaveBeenCalledWith('draft-tab-1', expect.objectContaining({
        id: 'local-note',
        teamPath: LOCAL_VAULT_TEAM_PATH,
      }), { title: 'Local draft', content: '# Local draft' });
    });
    expect(api.localVault.getSnapshot).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['electron', 'local-vault', 'snapshot', null])).toEqual(snapshot);
  });

  it('keeps the draft unmaterialized when create fails', async () => {
    const api = {
      hackmd: {
        createNote: vi.fn(async () => {
          throw new Error('Network failed');
        }),
      },
    } as unknown as HackDeskElectronAPI;
    const onDraftNoteCreated = vi.fn();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api,
      scope: { type: 'personal', label: 'My Workspace' },
      onDraftNoteCreated,
    })), { wrapper: Wrapper });

    await expect(result.current.createDraftNoteMutation.mutateAsync({
      tabId: 'draft-tab-1',
      input: { title: 'Draft', content: 'Body' },
    })).rejects.toThrow('Network failed');

    expect(onDraftNoteCreated).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Network failed');
  });
});

describe('useElectronNoteMutations local note save', () => {
  it('checks the restored draft revision instead of the newly loaded disk revision', async () => {
    const originalRevision = { contentHash: 'original', mtimeMs: 1 };
    const diskRevision = { contentHash: 'external-change', mtimeMs: 2 };
    const note = { ...createDocument({ teamPath: LOCAL_VAULT_TEAM_PATH }), localRevision: diskRevision };
    const api = { localVault: { writeNote: vi.fn(async () => { throw new Error('File changed on disk.'); }) } } as unknown as HackDeskElectronAPI;
    const { Wrapper } = createWrapper();
    const options = createOptions({ api, scope: { type: 'local', label: 'Local Vault' } });
    const { result } = renderHook(() => useElectronNoteMutations(options), { wrapper: Wrapper });
    await expect(result.current.updateNoteMutation.mutateAsync({
      note, input: { content: 'Recovered edit' }, intent: 'content', tabId: 'restored-tab',
      submittedDraft: { title: note.title, content: 'Recovered edit', baseRevision: originalRevision },
    })).rejects.toThrow('File changed on disk');
    expect(api.localVault.writeNote).toHaveBeenCalledWith({ noteId: note.id, content: 'Recovered edit', expectedRevision: originalRevision });
    expect(options.onNoteSaved).not.toHaveBeenCalled();
  });

  it('sends changed title and content through one Local Vault write', async () => {
    const note = {
      ...createDocument({
        id: 'local-note-1',
        title: 'Local draft',
        content: '# Local draft',
        teamPath: LOCAL_VAULT_TEAM_PATH,
      }),
      localRelativePath: 'Local draft.md',
      localRevision: { contentHash: 'hash-1', mtimeMs: 1 },
    };
    const updatedDocument = createLocalDocument({
      title: 'Renamed',
      relativePath: 'Renamed.md',
      content: '# Updated',
      revision: { contentHash: 'hash-2', mtimeMs: 2 },
    });
    const snapshot = createSnapshot(updatedDocument);
    const api = {
      localVault: {
        renameNote: vi.fn(),
        writeNote: vi.fn(async () => ({ document: updatedDocument, snapshot })),
      },
    } as unknown as HackDeskElectronAPI;
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api,
      scope: { type: 'local', label: 'Local Vault' },
    })), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateNoteMutation.mutateAsync({
        note,
        input: { title: 'Renamed', content: '# Updated' },
        intent: 'content',
      });
    });

    expect(api.localVault.writeNote).toHaveBeenCalledWith({
      noteId: 'local-note-1',
      title: 'Renamed',
      content: '# Updated',
      expectedRevision: { contentHash: 'hash-1', mtimeMs: 1 },
    });
    expect(api.localVault.renameNote).not.toHaveBeenCalled();
  });

  it('does not rename back when a fresh document arrives before the unchanged draft title is rebased', async () => {
    const disk = createLocalDocument({ title: 'Moved', relativePath: 'Moved.md' });
    const snapshot = createSnapshot(disk);
    const api = { localVault: { writeNote: vi.fn(async () => ({ document: disk, snapshot })) } } as unknown as HackDeskElectronAPI;
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({ api, scope: { type: 'local', label: 'Local Vault' } })), { wrapper: Wrapper });
    const note = { ...createDocument({ id: disk.id, title: 'Moved', teamPath: LOCAL_VAULT_TEAM_PATH }), localRevision: disk.revision, localRelativePath: 'Moved.md' };
    await act(async () => {
      await result.current.updateNoteMutation.mutateAsync({
        note, input: { title: 'Original', content: 'My draft' }, intent: 'content',
        submittedDraft: { title: 'Original', content: 'My draft', baseTitle: 'Original', baseContent: 'Body', baseRevision: disk.revision },
      });
    });
    expect(api.localVault.writeNote).toHaveBeenCalledWith({ noteId: disk.id, content: 'My draft', expectedRevision: disk.revision });
  });
});

describe('useElectronNoteMutations local folders', () => {
  const archiveFolder = {
    id: 'local-folder:Archive/Design',
    name: 'Design',
    relativePath: 'Archive/Design',
    parentPath: 'Archive',
    createdAtMillis: 1,
    updatedAtMillis: 1,
  };
  const projectFolder = {
    id: 'local-folder:Projects/Design',
    name: 'Design',
    relativePath: 'Projects/Design',
    parentPath: 'Projects',
    createdAtMillis: 2,
    updatedAtMillis: 2,
  };

  it('selects the folder identity returned by a local create', async () => {
    const snapshot = { ...createSnapshot(), folders: [archiveFolder, projectFolder] };
    const api = {
      localVault: {
        createFolder: vi.fn(async () => ({ folder: projectFolder, snapshot })),
      },
    } as unknown as HackDeskElectronAPI;
    const onFolderCreated = vi.fn();
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api,
      scope: { type: 'local', label: 'Local Vault' },
      selectedParentFolderId: 'local-folder:Projects',
      onFolderCreated,
    })), { wrapper: Wrapper });

    await act(async () => {
      await result.current.createFolderMutation.mutateAsync({ name: 'Design' });
    });

    expect(api.localVault.createFolder).toHaveBeenCalledWith({ name: 'Design', parentPath: 'Projects' });
    expect(onFolderCreated).toHaveBeenCalledWith(expect.objectContaining({
      id: 'local-folder:Projects/Design',
      parentId: 'local-folder:Projects',
    }));
    expect(queryClient.getQueryData(['electron', 'local-vault', 'snapshot', null])).toEqual(snapshot);
  });

  it('selects the folder identity returned by a local rename', async () => {
    const snapshot = { ...createSnapshot(), folders: [archiveFolder, projectFolder] };
    const api = {
      localVault: {
        renameFolder: vi.fn(async () => ({ folder: projectFolder, snapshot })),
      },
    } as unknown as HackDeskElectronAPI;
    const onFolderRenamed = vi.fn();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api,
      scope: { type: 'local', label: 'Local Vault' },
      onFolderRenamed,
    })), { wrapper: Wrapper });

    await act(async () => {
      await result.current.renameFolderMutation.mutateAsync({
        folderId: 'local-folder:Projects/Old',
        input: { name: 'Design' },
      });
    });

    expect(api.localVault.renameFolder).toHaveBeenCalledWith({
      relativePath: 'Projects/Old',
      name: 'Design',
    });
    expect(onFolderRenamed).toHaveBeenCalledWith(expect.objectContaining({
      id: 'local-folder:Projects/Design',
      parentId: 'local-folder:Projects',
    }));
  });
});

describe('useElectronNoteMutations settings updates', () => {
  it('serializes consecutive settings writes', async () => {
    const savedSettings = { hasHackmdApiToken: false } as ElectronSafeSettings;
    let resolveFirst!: (settings: ElectronSafeSettings) => void;
    const firstUpdate = new Promise<ElectronSafeSettings>((resolve) => {
      resolveFirst = resolve;
    });
    const update = vi.fn()
      .mockImplementationOnce(() => firstUpdate)
      .mockResolvedValueOnce(savedSettings);
    const api = { settings: { update } } as unknown as HackDeskElectronAPI;
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api,
      scope: { type: 'personal', label: 'My Workspace' },
    })), { wrapper: Wrapper });
    const firstInput = { workspaceNavigation: { pinnedTeamIds: ['team-1'] } };
    const secondInput = { workspaceNavigation: { pinnedTeamIds: ['team-2'] } };

    act(() => {
      result.current.updateSettingsMutation.mutate(firstInput);
      result.current.updateSettingsMutation.mutate(secondInput);
    });

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update).toHaveBeenCalledWith(firstInput);

    resolveFirst(savedSettings);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenNthCalledWith(2, secondInput);
  });
});

describe('mutation workspace ownership', () => {
  it('keeps both steps of a delayed folder move and invalidation in Team A', async () => {
    const pending = Promise.withResolvers<void>();
    const api = { hackmd: {
      updateTeamFolder: vi.fn(() => pending.promise), updateTeamFolderOrder: vi.fn(async () => ({})),
    } } as unknown as HackDeskElectronAPI;
    const scope: WorkspaceScope = { type: 'team', label: 'A', teamPath: 'a' };
    const { queryClient, Wrapper } = createWrapper();
    const { result, rerender } = renderHook(useElectronNoteMutations, {
      initialProps: createOptions({ api, scope }), wrapper: Wrapper,
    });
    queryClient.setQueryData(getFoldersQueryKey(scope), []);
    act(() => { result.current.moveFolderMutation.mutate({ folderId: 'folder', parentFolderId: 'parent', order: { parent: ['folder'] }, parentChanged: true, orderChanged: true, changed: true }); });
    await waitFor(() => expect(api.hackmd.updateTeamFolder).toHaveBeenCalledWith('a', 'folder', { parentFolderId: 'parent' }));
    const destination: WorkspaceScope = { type: 'team', label: 'B', teamPath: 'b' };
    queryClient.setQueryData(getFoldersQueryKey(destination), []);
    rerender(createOptions({ api, scope: destination }));
    await act(async () => { pending.resolve(); });
    await waitFor(() => expect(api.hackmd.updateTeamFolderOrder).toHaveBeenCalledWith('a', { parent: ['folder'] }));
    expect(queryClient.getQueryState(getFoldersQueryKey(scope))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(getFoldersQueryKey(destination))?.isInvalidated).toBe(false);
  });

  it.each<WorkspaceScope>([
    { type: 'personal', label: 'My Workspace' },
    { type: 'team', label: 'Team A', teamPath: 'team-a' },
  ])('keeps delayed create, save and folder results in $type', async (scope) => {
    const note = createDocument({ teamPath: scope.type === 'team' ? scope.teamPath : null });
    const folder = { id: 'folder-a', name: 'A' };
    const created = Promise.withResolvers<DocumentSummary>();
    const saved = Promise.withResolvers<DocumentSummary>();
    const folderCreated = Promise.withResolvers<typeof folder>();
    const api = { hackmd: {
      createNote: vi.fn(() => created.promise), createTeamNote: vi.fn(() => created.promise),
      updateNote: vi.fn(() => saved.promise), updateTeamNote: vi.fn(() => saved.promise),
      createFolder: vi.fn(() => folderCreated.promise), createTeamFolder: vi.fn(() => folderCreated.promise),
    } } as unknown as HackDeskElectronAPI;
    const origin = createOptions({ api, scope, selectedParentFolderId: 'parent-a' });
    const destination = createOptions({ api, scope: { type: 'team', label: 'Team B', teamPath: 'team-b' } });
    const { queryClient, Wrapper } = createWrapper();
    const { result, rerender } = renderHook(useElectronNoteMutations, { initialProps: origin, wrapper: Wrapper });
    queryClient.setQueryData(getFoldersQueryKey(scope), []);
    queryClient.setQueryData(getFoldersQueryKey(destination.scope), []);
    act(() => {
      result.current.createNoteMutation.mutate('A');
      result.current.updateNoteMutation.mutate({ note, input: { content: 'Saved' }, intent: 'content' });
      result.current.createFolderMutation.mutate({ name: 'A' });
    });
    await waitFor(() => expect(scope.type === 'team' ? api.hackmd.createTeamFolder : api.hackmd.createFolder).toHaveBeenCalledOnce());
    rerender(destination);
    await act(async () => {
      created.resolve(note);
      saved.resolve(note);
      folderCreated.resolve(folder);
    });
    await waitFor(() => expect(origin.onNoteSaved).toHaveBeenCalledOnce());
    expect(origin.onNoteCreated).toHaveBeenCalledWith(note);
    expect(origin.onFolderCreated).toHaveBeenCalledWith(folder);
    expect(destination.onNoteCreated).not.toHaveBeenCalled();
    expect(destination.onNoteSaved).not.toHaveBeenCalled();
    expect(destination.onFolderCreated).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(getWorkspaceQueryKey(scope))).toEqual({ source: 'remote', data: [note] });
    expect(queryClient.getQueryData(getWorkspaceQueryKey(destination.scope))).toBeUndefined();
    // Folder invalidation must target A, even if B is now active.
    expect(queryClient.getQueryState(getFoldersQueryKey(scope))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(getFoldersQueryKey(destination.scope))?.isInvalidated).toBe(false);
  });
});
