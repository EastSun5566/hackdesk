import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';
import { getLocalVaultDocumentQueryKey, invalidateMovedLocalVaultDocuments } from './local-vault-query';

const document = (path: string): LocalDocument => ({
  id: 'note', title: path.slice(0, -3), content: 'Body', relativePath: path, parentPath: null,
  revision: { contentHash: 'same', mtimeMs: 1 }, createdAtMillis: 1, updatedAtMillis: 1,
});
const snapshot = (path: string): LocalVaultSnapshot => ({
  vaultId: 'A', rootPath: '/A', folders: [], notes: [document(path)],
});

describe('moved Local Vault document cache', () => {
  it('invalidates inactive cached documents even without a prior snapshot, only in the current vault', async () => {
    const client = new QueryClient();
    const a = getLocalVaultDocumentQueryKey('note', 'A');
    const b = getLocalVaultDocumentQueryKey('note', 'B');
    const untouched = getLocalVaultDocumentQueryKey('other', 'A');
    client.setQueryData(a, document('Original.md'));
    client.setQueryData(b, document('Original.md'));
    client.setQueryData(untouched, { ...document('Other.md'), id: 'other' });
    await invalidateMovedLocalVaultDocuments(client, snapshot('Moved.md'));
    expect(client.getQueryState(a)?.isInvalidated).toBe(true);
    expect(client.getQueryState(b)?.isInvalidated).toBe(false);
    expect(client.getQueryState(untouched)?.isInvalidated).toBe(false);
    client.clear();
  });

  it('re-reads an open note that disappeared from the snapshot so its deletion is reported', async () => {
    const client = new QueryClient();
    const key = getLocalVaultDocumentQueryKey('note', 'A');
    client.setQueryData(key, document('Original.md'));
    await invalidateMovedLocalVaultDocuments(client, { ...snapshot('Original.md'), notes: [] }, snapshot('Original.md'));
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });

  it('cancels pending old-path reads and rejects late responses without affecting another vault', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = getLocalVaultDocumentQueryKey('note', 'A');
    const b = getLocalVaultDocumentQueryKey('note', 'B');
    client.setQueryData(b, document('B.md'));
    let resolve!: (value: LocalDocument) => void;
    const pending = new Promise<LocalDocument>((done) => { resolve = done; });
    const read = client.fetchQuery({ queryKey: key, queryFn: async ({ signal }) => {
      const result = await pending;
      signal.throwIfAborted();
      return result;
    } });
    const rejected = expect(read).rejects.toBeDefined();
    await invalidateMovedLocalVaultDocuments(client, snapshot('Moved.md'), snapshot('Original.md'));
    resolve(document('Original.md'));
    await rejected;
    expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getQueryData(b)).toEqual(document('B.md'));
    client.clear();
  });

  it('does not invalidate unchanged paths or compare different vault snapshots', async () => {
    const client = new QueryClient();
    const key = getLocalVaultDocumentQueryKey('note', 'A');
    client.setQueryData(key, document('Same.md'));
    await invalidateMovedLocalVaultDocuments(client, snapshot('Same.md'), { ...snapshot('Other.md'), vaultId: 'B' });
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });
});
