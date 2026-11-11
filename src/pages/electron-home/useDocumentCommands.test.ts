import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/toast';
import type { DocumentSummary, HackDeskElectronAPI, NoteSummary } from '@/lib/electron-api';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { useDocumentCommands, type DocumentCommandOptions } from './useDocumentCommands';

vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const openNote = { id: 'open', title: 'Open', teamPath: null, content: 'saved body' } as unknown as DocumentSummary;
const otherNote = { id: 'other', title: 'Other', teamPath: null } as unknown as NoteSummary;
const localNote = { id: 'local', title: 'Local', teamPath: LOCAL_VAULT_TEAM_PATH } as unknown as NoteSummary;

function setup() {
  const writeClipboardText = vi.fn(async () => undefined);
  const api = {
    app: { writeClipboardText },
    hackmd: { getNote: vi.fn(async () => ({ source: 'remote', data: { title: 'Other', content: 'remote body' } })) },
    localVault: { readNote: vi.fn(async () => ({ title: 'Local', content: 'local body' })) },
  } as unknown as HackDeskElectronAPI;
  const options = {
    api,
    deleteNote: vi.fn(),
    documentContent: 'unsaved body',
    documentTitle: 'Open',
    duplicateNote: vi.fn(),
    importMarkdownNote: vi.fn(),
    scopeType: 'personal',
    selectedDocument: openNote,
    selectedNote: { id: 'open', teamPath: null },
    setDeleteTarget: vi.fn(),
    trackRecentNote: vi.fn(),
  } as unknown as DocumentCommandOptions;
  const { result } = renderHook(() => useDocumentCommands(options));
  return { api, writeClipboardText, copy: result.current.handleCopyNoteContent };
}

describe('handleCopyNoteContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('copies what the editor shows for the open note, unsaved edits included', async () => {
    const { copy, writeClipboardText } = setup();
    copy(openNote);
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('unsaved body'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Note content copied.'));
  });

  it('reads any other note first, from HackMD or the local vault', async () => {
    const { copy, writeClipboardText } = setup();
    copy(otherNote);
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('remote body'));
    copy(localNote);
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('local body'));
  });
});
