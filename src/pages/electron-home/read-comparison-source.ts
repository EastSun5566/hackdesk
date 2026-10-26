import type { DocumentSummary, HackDeskElectronAPI } from '@/lib/electron-api';
import { runHackmdRequest } from '@/lib/hackmd-requests';
import { LOCAL_VAULT_TEAM_PATH, type LocalDocumentSummary } from './local-vault-adapter';

/** Uses the session-guarded Vault API; never writes the editor's query cache or baseline. */
export async function readComparisonSource(api: HackDeskElectronAPI | undefined, document: DocumentSummary, signal: AbortSignal, vaultId?: string | null) {
  if (!api) throw new Error('Comparison needs the HackDesk desktop app.');
  signal.throwIfAborted();
  if (document.teamPath === LOCAL_VAULT_TEAM_PATH) {
    if (!vaultId || (document as Partial<LocalDocumentSummary>).localVaultId !== vaultId) throw new Error('The active Local Vault changed. Reopen the comparison.');
    const current = await api.localVault.readNote(document.id);
    signal.throwIfAborted();
    return { title: current.title, content: current.content };
  }
  const value = await runHackmdRequest(api.hackmd, signal, api.hackmd.getNote, [document.id, document.teamPath]);
  signal.throwIfAborted();
  if (value.source !== 'remote') throw new Error('Could not load the latest note from HackMD. Your draft is kept.');
  return { title: value.data.title, content: value.data.content };
}
