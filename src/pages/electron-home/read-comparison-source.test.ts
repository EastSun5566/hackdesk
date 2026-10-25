import { expect, it, vi } from 'vitest';
import type { DocumentSummary, HackDeskElectronAPI } from '@/lib/electron-api';
import { readComparisonSource } from './read-comparison-source';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

it('rejects cached HackMD content and reads Local Vault through the supplied session guard', async () => {
  const getNote = vi.fn(async () => ({ source: 'cached', data: { title: 'Cached', content: 'old' } }));
  const readNote = vi.fn(async () => ({ title: 'Disk', content: 'new' }));
  const api = { hackmd: { getNote }, localVault: { readNote } } as unknown as HackDeskElectronAPI;
  const note = { id: 'note', teamPath: null } as DocumentSummary;
  const signal = new AbortController().signal;
  await expect(readComparisonSource(api, note, signal)).rejects.toThrow('latest note');
  await expect(readComparisonSource(api, { ...note, teamPath: LOCAL_VAULT_TEAM_PATH, localVaultId: 'vault-a' } as DocumentSummary, signal, 'vault-a')).resolves.toEqual({ title: 'Disk', content: 'new' });
  expect(readNote).toHaveBeenCalledWith('note');
});

it('rejects a note from a different vault before reading it', async () => {
  const readNote = vi.fn();
  const api = { localVault: { readNote } } as unknown as HackDeskElectronAPI;
  const note = { id: 'same-id', teamPath: LOCAL_VAULT_TEAM_PATH, localVaultId: 'vault-a' } as unknown as DocumentSummary;
  await expect(readComparisonSource(api, note, new AbortController().signal, 'vault-b')).rejects.toThrow('Vault changed');
  expect(readNote).not.toHaveBeenCalled();
});
