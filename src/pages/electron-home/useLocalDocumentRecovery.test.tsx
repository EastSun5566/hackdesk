import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';

import { LOCAL_VAULT_TEAM_PATH, toDocumentSummary, toNoteSummary } from './local-vault-adapter';
import type { OpenNoteTab } from './note-workspace';
import { useLocalDocumentRecovery } from './useLocalDocumentRecovery';

function createLocalDocument(overrides: Partial<LocalDocument> = {}): LocalDocument {
  return {
    content: 'Disk body',
    createdAtMillis: 1,
    id: 'local-note-1',
    parentPath: 'Projects',
    relativePath: 'Projects/Note.md',
    revision: { contentHash: 'new', mtimeMs: 2 },
    title: 'Note',
    updatedAtMillis: 2,
    ...overrides,
  };
}

function createSnapshot(document = createLocalDocument()): LocalVaultSnapshot {
  return {
    vaultId: 'vault-1',
    rootPath: '/tmp/vault',
    folders: [{
      createdAtMillis: 1,
      id: 'local-folder:Projects',
      name: 'Projects',
      parentPath: null,
      relativePath: 'Projects',
      updatedAtMillis: 1,
    }],
    notes: [document],
  };
}

function createTab(overrides: Partial<OpenNoteTab> = {}): OpenNoteTab {
  return {
    localRevision: { contentHash: 'old', mtimeMs: 1 },
    noteId: 'local-note-1',
    shortId: 'Projects/Note.md',
    tabId: 'tab-1',
    teamPath: LOCAL_VAULT_TEAM_PATH,
    title: 'Note',
    updatedAtMillis: 1,
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
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

function createApi(snapshot = createSnapshot()) {
  return {
    localVault: {
      createNote: vi.fn(async () => createLocalDocument({
        id: 'copy-note',
        relativePath: 'Projects/Note copy.md',
        title: 'Note copy',
      })),
      getSnapshot: vi.fn(async () => snapshot),
    },
  } as unknown as HackDeskElectronAPI;
}

function createOptions(overrides: Partial<Parameters<typeof useLocalDocumentRecovery>[0]> = {}) {
  const document = createLocalDocument();
  const snapshot = createSnapshot(document);
  const tab = createTab();
  const api = createApi(snapshot);

  return {
    api,
    clearDraft: vi.fn(),
    documentQueries: {
      refetchByIdentity: vi.fn(async () => ({ data: document })),
    },
    drafts: {},
    enabled: true,
    getTabsMatching: vi.fn(() => [tab]),
    notes: [toNoteSummary(document, snapshot)],
    openNote: vi.fn(),
    resetSaveMutation: vi.fn(),
    syncNoteSummary: vi.fn(),
    tabs: { [tab.tabId]: tab },
    trackRecentNote: vi.fn(),
    ...overrides,
  };
}

describe('useLocalDocumentRecovery', () => {
  it('silently reloads clean local tabs when their disk revision changes', async () => {
    const { Wrapper } = createWrapper();
    const options = createOptions();

    renderHook(() => useLocalDocumentRecovery(options), { wrapper: Wrapper });

    await waitFor(() => {
      expect(options.documentQueries.refetchByIdentity).toHaveBeenCalledWith({
        id: 'local-note-1',
        teamPath: LOCAL_VAULT_TEAM_PATH,
      });
    });
    expect(options.syncNoteSummary).toHaveBeenCalledWith(expect.objectContaining({
      id: 'local-note-1',
      localRevision: { contentHash: 'new', mtimeMs: 2 },
    }));
  });

  it('does not silently reload dirty local tabs', async () => {
    const { Wrapper } = createWrapper();
    const options = createOptions({
      drafts: {
        'tab-1': {
          baseContent: 'Disk body',
          baseRevision: { contentHash: 'old', mtimeMs: 1 },
          baseTitle: 'Note',
          content: 'Draft body',
          title: 'Note',
        },
      },
    });

    renderHook(() => useLocalDocumentRecovery(options), { wrapper: Wrapper });

    await Promise.resolve();
    expect(options.documentQueries.refetchByIdentity).not.toHaveBeenCalled();
  });

  it('reloads from disk and clears matching drafts on demand', async () => {
    const { Wrapper } = createWrapper();
    const options = createOptions();
    const { result } = renderHook(() => useLocalDocumentRecovery(options), { wrapper: Wrapper });
    const document = toDocumentSummary(createLocalDocument(), createSnapshot());

    await act(async () => {
      result.current.reloadFromDisk(document);
    });

    await waitFor(() => {
      expect(options.clearDraft).toHaveBeenCalledWith('tab-1');
    });
    expect(options.resetSaveMutation).toHaveBeenCalledOnce();
  });

  it('saves the current draft as a copy in the same local folder', async () => {
    const { Wrapper } = createWrapper();
    const options = createOptions();
    const { result } = renderHook(() => useLocalDocumentRecovery(options), { wrapper: Wrapper });
    const document = toDocumentSummary(createLocalDocument(), createSnapshot());

    await act(async () => {
      result.current.saveAsCopy(document, {
        content: 'Draft body',
        title: 'Draft title',
      });
    });

    await waitFor(() => {
      expect(options.api?.localVault.createNote).toHaveBeenCalledWith({
        content: 'Draft body',
        parentPath: 'Projects',
        title: 'Draft title copy',
      });
    });
    expect(options.openNote).toHaveBeenCalledWith(expect.objectContaining({
      id: 'copy-note',
      teamPath: LOCAL_VAULT_TEAM_PATH,
    }));
    expect(options.trackRecentNote).toHaveBeenCalledWith(expect.objectContaining({
      id: 'copy-note',
    }));
  });
});
