import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/toast';
import type { DocumentSummary, ElectronSafeSettings, HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';

import { HACKMD_NOTE_CHANGED_MESSAGE } from '@/lib/note-errors';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { deriveDraftNoteTitle, useElectronNoteMutations } from './useElectronNoteMutations';
import type { SettingsFormInput, WorkspaceScope } from './types';
import { getFoldersQueryKey, getWorkspaceQueryKey } from './repository';
import { defaultSettings } from '@/lib/settings';

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

describe('useElectronNoteMutations remote save conflicts', () => {
  const scope: WorkspaceScope = { type: 'team', label: 'Team A', teamPath: 'team-a' };
  const noteKey = ['electron', 'hackmd', 'note', 'team-a', 'note-1'];

  function setup(latest: unknown) {
    const note = createDocument({ teamPath: 'team-a', content: 'Base' });
    const api = { hackmd: {
      getNote: vi.fn(async () => latest),
      updateTeamNote: vi.fn(async (_teamPath: string, _id: string, input: { content?: string }) => ({ ...note, content: input.content ?? note.content })),
    } } as unknown as HackDeskElectronAPI;
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(useElectronNoteMutations, { initialProps: createOptions({ api, scope }), wrapper: Wrapper });
    const save = (input: { content?: string; tags?: string[] }, intent: 'content' | 'metadata' = 'content') => act(() => {
      result.current.updateNoteMutation.mutate({
        note, input, intent, tabId: 'tab-1',
        submittedDraft: { title: note.title, content: input.content ?? note.content, baseTitle: note.title, baseContent: 'Base' },
      });
    });
    return { api, note, queryClient, result, save };
  }

  it('saves when HackMD still has the draft base', async () => {
    const { api, save } = setup({ source: 'remote', data: createDocument({ teamPath: 'team-a', content: 'Base' }) });
    save({ content: 'Edited' });
    await waitFor(() => expect(api.hackmd.updateTeamNote).toHaveBeenCalledWith('team-a', 'note-1', expect.objectContaining({ content: 'Edited' })));
    expect(api.hackmd.getNote).toHaveBeenCalledWith('note-1', 'team-a');
  });

  it('does not write over a note changed on HackMD and shows the latest copy', async () => {
    const latest = { source: 'remote', data: createDocument({ teamPath: 'team-a', content: 'Changed elsewhere' }) };
    const { api, queryClient, result, save } = setup(latest);
    save({ content: 'Edited' });
    await waitFor(() => expect(result.current.updateNoteMutation.isError).toBe(true));
    expect(result.current.updateNoteMutation.error?.message).toBe(HACKMD_NOTE_CHANGED_MESSAGE);
    expect(api.hackmd.updateTeamNote).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(noteKey)).toEqual(latest);
  });

  it.each([
    ['a cached copy', { source: 'cached', data: createDocument({ teamPath: 'team-a', content: 'Base' }) }],
    ['a read error', { source: 'error', error: 'HackMD is offline.' }],
  ])('does not write when the latest note is only %s', async (_label, latest) => {
    const { api, result, save } = setup(latest);
    save({ content: 'Edited' });
    await waitFor(() => expect(result.current.updateNoteMutation.isError).toBe(true));
    expect(result.current.updateNoteMutation.error?.message).toContain('Could not check HackMD for newer changes');
    expect(api.hackmd.updateTeamNote).not.toHaveBeenCalled();
  });

  it('saves metadata without checking content', async () => {
    const { api, save } = setup({ source: 'remote', data: createDocument({ teamPath: 'team-a', content: 'Changed elsewhere' }) });
    save({ tags: ['a'] }, 'metadata');
    await waitFor(() => expect(api.hackmd.updateTeamNote).toHaveBeenCalledWith('team-a', 'note-1', { tags: ['a'] }));
    expect(api.hackmd.getNote).not.toHaveBeenCalled();
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
  beforeEach(() => vi.clearAllMocks());

  const preferences: [string, SettingsFormInput][] = [
    ['pin', { title: 'HackDesk', workspaceNavigation: { pinnedTeamIds: ['team-1'] } }],
    ['unpin', { title: 'HackDesk', workspaceNavigation: { pinnedTeamIds: [] } }],
    ['reorder', { title: 'HackDesk', workspaceNavigation: { pinnedTeamIds: ['team-2', 'team-1'] } }],
    ['editor mode', { title: 'HackDesk', editor: { mode: 'vim' } }],
    ['appearance', { title: 'HackDesk', appearance: defaultSettings.appearance }],
  ];

  it.each(preferences)('persists %s without submit feedback or invalidating HackMD data', async (_name, input) => {
    const savedSettings = { hasHackmdApiToken: true } as ElectronSafeSettings;
    const api = { settings: { update: vi.fn(async () => savedSettings) } } as unknown as HackDeskElectronAPI;
    const options = createOptions({ api, scope: { type: 'personal', label: 'My Workspace' } });
    const { queryClient, Wrapper } = createWrapper();
    const key = ['electron', 'hackmd', 'notes'];
    const note = createDocument();
    queryClient.setQueryData(key, [note]);
    const { result } = renderHook(() => useElectronNoteMutations(options), { wrapper: Wrapper });

    await act(async () => { await result.current.updateSettingsMutation.mutateAsync(input); });

    expect(api.settings.update).toHaveBeenCalledWith(input);
    expect(queryClient.getQueryData(['electron', 'settings'])).toEqual(savedSettings);
    expect(queryClient.getQueryData(key)).toEqual([note]);
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    expect(options.onSettingsSaved).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each(['replacement-token', ''])('refreshes or clears only HackMD caches when updating the token (%s)', async token => {
    const savedSettings = { hasHackmdApiToken: Boolean(token) } as ElectronSafeSettings;
    const api = { settings: { update: vi.fn(async () => savedSettings) } } as unknown as HackDeskElectronAPI;
    const { queryClient, Wrapper } = createWrapper();
    const remoteKey = ['electron', 'hackmd', 'notes'];
    const localKey = ['electron', 'local-vault', 'snapshot', 'vault-1'];
    const note = createDocument();
    queryClient.setQueryData(remoteKey, [note]);
    queryClient.setQueryData(localKey, createSnapshot());
    const { result } = renderHook(() => useElectronNoteMutations(createOptions({
      api, scope: { type: 'personal', label: 'My Workspace' },
    })), { wrapper: Wrapper });

    await act(async () => { await result.current.updateSettingsMutation.mutateAsync({ title: 'HackDesk', hackmdApiToken: token }); });

    if (token) expect(queryClient.getQueryState(remoteKey)?.isInvalidated).toBe(true);
    else expect(queryClient.getQueryData(remoteKey)).toBeUndefined();
    expect(queryClient.getQueryData(localKey)).toEqual(createSnapshot());
    expect(queryClient.getQueryState(localKey)?.isInvalidated).toBe(false);
  });

  it('keeps dialog submit feedback when an inline update is queued during Save', async () => {
    const savedSettings = { hasHackmdApiToken: true } as ElectronSafeSettings;
    const first = Promise.withResolvers<ElectronSafeSettings>();
    const api = { settings: { update: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(savedSettings) } } as unknown as HackDeskElectronAPI;
    const options = createOptions({ api, scope: { type: 'personal', label: 'My Workspace' } });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(options), { wrapper: Wrapper });
    let submit!: Promise<void>;
    let inline!: Promise<ElectronSafeSettings>;
    act(() => {
      submit = result.current.submitSettings({ title: 'New title' });
      inline = result.current.updateSettingsMutation.mutateAsync({ title: 'New title', editor: { mode: 'vim' } });
    });
    await waitFor(() => expect(api.settings.update).toHaveBeenCalledOnce());
    expect(options.onSettingsSaved).not.toHaveBeenCalled();
    await act(async () => { first.resolve(savedSettings); await Promise.all([submit, inline]); });
    expect(options.onSettingsSaved).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Settings saved.');
  });

  it('keeps Settings open and reports a failed submit once', async () => {
    const api = { settings: { update: vi.fn(async () => { throw new Error('Storage unavailable'); }) } } as unknown as HackDeskElectronAPI;
    const options = createOptions({ api, scope: { type: 'personal', label: 'My Workspace' } });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useElectronNoteMutations(options), { wrapper: Wrapper });
    await act(async () => { await result.current.submitSettings({ title: 'New title' }); });
    expect(options.onSettingsSaved).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('Storage unavailable');
  });

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
  it('lets B create while A is pending, restores A status on return and isolates errors/reset', async () => {
    const a = Promise.withResolvers<DocumentSummary>();
    const b = Promise.withResolvers<DocumentSummary>();
    const api = { hackmd: { createNote: vi.fn(() => a.promise), createTeamNote: vi.fn(() => b.promise) } } as unknown as HackDeskElectronAPI;
    const origin = createOptions({ api, scope: { type: 'personal', label: 'A' } });
    const destination = createOptions({ api, scope: { type: 'team', label: 'B', teamPath: 'b' } });
    const { Wrapper } = createWrapper();
    const { result, rerender } = renderHook(useElectronNoteMutations, { initialProps: origin, wrapper: Wrapper });
    act(() => { result.current.createNoteMutation.mutate('A'); });
    await waitFor(() => expect(result.current.createNoteMutation.isPending).toBe(true));
    rerender(destination);
    expect(result.current.createNoteMutation.isIdle).toBe(true);
    expect(result.current.createNoteMutation.variables).toBeUndefined();
    act(() => { result.current.createNoteMutation.mutate('B'); });
    await waitFor(() => expect(api.hackmd.createTeamNote).toHaveBeenCalledWith('b', expect.objectContaining({ title: 'B' })));
    rerender(origin);
    expect(result.current.createNoteMutation.isPending).toBe(true);
    expect(result.current.createNoteMutation.variables).toBe('A');
    await act(async () => { b.resolve(createDocument({ id: 'b', teamPath: 'b' })); });
    expect(result.current.createNoteMutation.isPending).toBe(true);
    await act(async () => { a.reject(new Error('A failed')); });
    await waitFor(() => expect(result.current.createNoteMutation.isError).toBe(true));
    rerender(destination);
    expect(result.current.createNoteMutation.isSuccess).toBe(true);
    expect(result.current.createNoteMutation.error).toBeNull();
    rerender(origin);
    expect(result.current.createNoteMutation.error?.message).toBe('A failed');
    act(() => { result.current.createNoteMutation.reset(); });
    await waitFor(() => expect(result.current.createNoteMutation.isIdle).toBe(true));
    rerender(destination);
    expect(result.current.createNoteMutation.isSuccess).toBe(true);
    expect(destination.onNoteCreated).toHaveBeenCalledOnce();
    expect(origin.onNoteCreated).not.toHaveBeenCalled();
  });

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
      getNote: vi.fn(async () => ({ source: 'remote', data: note })),
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
    expect(result.current.createNoteMutation.isPending).toBe(false);
    expect(result.current.updateNoteMutation.isPending).toBe(false);
    expect(result.current.createFolderMutation.isPending).toBe(false);
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
