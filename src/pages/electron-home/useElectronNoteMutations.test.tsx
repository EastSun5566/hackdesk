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
    expect(onDraftNoteCreated).toHaveBeenCalledWith('draft-tab-1', created);
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
      }));
    });
    expect(api.localVault.getSnapshot).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['electron', 'local-vault', 'snapshot'])).toEqual(snapshot);
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
    expect(queryClient.getQueryData(['electron', 'local-vault', 'snapshot'])).toEqual(snapshot);
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
