import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';

import type { OpenNoteTab } from './note-workspace';
import { useRemoteDocumentRecovery } from './useRemoteDocumentRecovery';

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast }));

afterEach(() => { toast.error.mockClear(); });

const document = { id: 'note-1', teamPath: 'team-a', title: 'Note', content: 'Latest' } as DocumentSummary;
const tabs = [{ tabId: 'tab-1' }, { tabId: 'tab-2' }] as OpenNoteTab[];

function setup(result: unknown) {
  const queryClient = new QueryClient();
  const options = {
    clearDraft: vi.fn(),
    documentQueries: { refetchByIdentity: vi.fn(async () => result) },
    getTabsMatching: vi.fn(() => tabs),
    resetSaveMutation: vi.fn(),
  };
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useRemoteDocumentRecovery(options), { wrapper });
  act(() => { hook.result.current.reloadFromHackmd(document); });
  return { options, queryClient };
}

describe('useRemoteDocumentRecovery', () => {
  it.each([
    ['a query refetch', { data: { source: 'remote', data: document }, error: null }, undefined],
    // Without a mounted query, the read is cached so the cleared tab shows it.
    ['a direct read', { source: 'remote', data: document }, { source: 'remote', data: document }],
  ])('clears drafts after %s returns the note from HackMD', async (_label, result, cached) => {
    const { options, queryClient } = setup(result);
    await waitFor(() => expect(options.resetSaveMutation).toHaveBeenCalledOnce());
    expect(options.documentQueries.refetchByIdentity).toHaveBeenCalledWith({ id: 'note-1', teamPath: 'team-a' });
    expect(options.getTabsMatching).toHaveBeenCalledWith({ id: 'note-1', teamPath: 'team-a' });
    expect(options.clearDraft.mock.calls).toEqual([['tab-1'], ['tab-2']]);
    expect(queryClient.getQueryData(['electron', 'hackmd', 'note', 'team-a', 'note-1'])).toEqual(cached);
  });

  it.each([
    ['a cached copy', { source: 'cached', data: document }, 'Could not load the latest note from HackMD'],
    ['a read error', { source: 'error', error: 'HackMD is offline.' }, 'HackMD is offline.'],
    ['a failed query refetch that kept old data', { data: { source: 'remote', data: document }, error: new Error('Network failed.') }, 'Network failed.'],
  ])('keeps drafts when the reload returns %s', async (_label, result, message) => {
    const { options } = setup(result);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(message)));
    expect(options.clearDraft).not.toHaveBeenCalled();
    expect(options.resetSaveMutation).not.toHaveBeenCalled();
  });
});
