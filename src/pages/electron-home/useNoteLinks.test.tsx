import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, NoteSummary } from '@/lib/electron-api';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { useNoteLinkOpener } from './useNoteLinkOpener';
import { getNoteLinkCandidates, getWorkspaceTags } from './useNoteLinks';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toast', () => ({ toast: { error: toastError } }));

function note(overrides: Partial<NoteSummary>): NoteSummary {
  return {
    id: 'note-1', shortId: 'note-1', title: 'Note', permalink: null, userPath: null, teamPath: null, ...overrides,
  } as NoteSummary;
}

function vaultNote(relativePath: string) {
  return {
    ...note({ id: relativePath, shortId: relativePath, title: relativePath, teamPath: LOCAL_VAULT_TEAM_PATH }),
    localVaultId: 'vault-1',
    localRelativePath: relativePath,
  } as unknown as DocumentSummary;
}

function installApi({ resolved = null, resolveNote }: { resolved?: unknown; resolveNote?: () => Promise<unknown> } = {}) {
  const resolveLink = vi.fn(async () => resolved);
  const api = { getRuntimeEnvironment: () => 'electron', noteIndex: { resolveLink }, hackmd: { resolveNote: resolveNote && vi.fn(resolveNote) } };
  window.hackdeskAPI = api as unknown as typeof window.hackdeskAPI;
  return api;
}

afterEach(() => {
  delete window.hackdeskAPI;
  toastError.mockClear();
});

describe('getNoteLinkCandidates', () => {
  it('links vault notes by relative path, and HackMD notes by URL and embed reference', () => {
    const from = vaultNote('notes/a.md');
    expect(getNoteLinkCandidates(from, [from, vaultNote('notes/sub/b c.md'), note({ id: 'h1' })])).toEqual([
      { title: 'notes/sub/b c.md', detail: 'notes/sub/b c.md', link: './sub/b%20c.md', embedRef: null },
    ]);

    const hackmd = note({ id: 'h1' }) as DocumentSummary;
    const [candidate] = getNoteLinkCandidates(hackmd, [hackmd, note({ id: 'h2', shortId: 'beta', permalink: 'beta-plan', userPath: 'me', title: 'Beta' })]);
    expect(candidate).toMatchObject({ title: 'Beta', embedRef: '@me/beta-plan' });
    expect(candidate?.link).toMatch(/^https:\/\/hackmd\.io\//);
  });
});

describe('getWorkspaceTags', () => {
  it('lists each tag the notes use once, in order', () => {
    expect(getWorkspaceTags([
      note({ id: 'a', tags: ['release', 'design'] }),
      note({ id: 'b', tags: ['design', 'Planning'] }),
      note({ id: 'c', tags: [] }),
    ])).toEqual(['design', 'Planning', 'release']);
  });
});

describe('useNoteLinkOpener', () => {
  function render(document: DocumentSummary) {
    const openNoteTarget = vi.fn();
    const openExternal = vi.fn();
    const { result } = renderHook(() => useNoteLinkOpener({ document, openNoteTarget, openExternal }));
    return { open: result.current, openNoteTarget, openExternal };
  }

  it('opens a link the index knows in a tab, without calling HackMD', async () => {
    const api = installApi({ resolved: { kind: 'local', vaultId: 'vault-1', noteId: 'notes/b.md', title: 'B', snippet: null }, resolveNote: async () => ({}) });
    const { open, openNoteTarget, openExternal } = render(vaultNote('notes/a.md'));
    await act(() => open('./b.md'));
    expect(api.noteIndex.resolveLink).toHaveBeenCalledWith({ target: './b.md', kind: 'url', from: { source: 'local', vaultId: 'vault-1', noteId: 'notes/a.md' } });
    expect(openNoteTarget).toHaveBeenCalledWith(expect.objectContaining({ vaultId: 'vault-1', noteId: 'notes/b.md', teamPath: LOCAL_VAULT_TEAM_PATH }));
    expect(api.hackmd.resolveNote).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('asks HackMD once for a link nothing local knows, and falls back to the browser', async () => {
    const found = { noteId: 'long-2', teamPath: null, title: 'Beta', shortId: 'beta' };
    let api = installApi({ resolveNote: async () => found });
    let opener = render(note({ id: 'h1' }) as DocumentSummary);
    await act(() => opener.open('https://hackmd.io/@me/beta'));
    expect(api.hackmd.resolveNote).toHaveBeenCalledOnce();
    expect(opener.openNoteTarget).toHaveBeenCalledWith(expect.objectContaining(found));

    api = installApi({ resolveNote: async () => { throw new Error('404'); } });
    opener = render(note({ id: 'h1' }) as DocumentSummary);
    await act(() => opener.open('https://hackmd.io/@me/gone'));
    expect(opener.openExternal).toHaveBeenCalledWith('https://hackmd.io/@me/gone');
    expect(opener.openNoteTarget).not.toHaveBeenCalled();
  });

  it('sends other web links to the browser and reports missing vault notes', async () => {
    const api = installApi();
    const { open, openExternal } = render(vaultNote('notes/a.md'));
    await act(() => open('https://example.com/page'));
    expect(openExternal).toHaveBeenCalledWith('https://example.com/page');
    expect(api.noteIndex.resolveLink).not.toHaveBeenCalled();

    await act(() => open('./missing.md'));
    expect(toastError).toHaveBeenCalledWith('No note at “./missing.md” in this vault.');
  });

  it('opens a relative link in a HackMD note against the note on hackmd.io', async () => {
    const api = installApi();
    const { open, openExternal } = render(note({ id: 'h1', shortId: 'abc', userPath: 'me', permalink: 'notes', publishType: 'edit' }) as DocumentSummary);
    await act(() => open('./plan.md'));
    expect(openExternal).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/hackmd\.io\/.*plan\.md$/));
    expect(api.noteIndex.resolveLink).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
