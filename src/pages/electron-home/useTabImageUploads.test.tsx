import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, NoteSummary, UploadNoteImageResult } from '@/lib/electron-api';

import { useNoteWorkspaceTabs } from './useNoteWorkspaceTabs';
import { useTabImageUploads } from './useTabImageUploads';
import type { OpenNoteTab } from './note-workspace';

const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  toast.error.mockClear();
  toast.info.mockClear();
});

const PLACEHOLDER = '![Uploading image 1a2b3c4d...]()';
const OTHER = '![Uploading image ffffffff...]()';
const note = (id: string) => ({ id, shortId: id, title: id, content: '', teamPath: null, updatedAtMillis: 1 } as NoteSummary);
const document = (id: string, content = ''): DocumentSummary => ({ ...note(id), content } as DocumentSummary);
function imageFile() {
  const file = new File(['image-bytes'], 'diagram.png', { type: 'image/png' });
  // jsdom's File has no arrayBuffer().
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(11) });
  return file;
}

function deferred() {
  let resolve!: (value: UploadNoteImageResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<UploadNoteImageResult>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function setup(initialScope = 'personal', savedContent?: Record<string, string>) {
  const upload = deferred();
  const uploadImage = vi.fn(() => upload.promise);
  const readTabDocument = vi.fn(async (_scope: string, tab: OpenNoteTab) => ('noteId' in tab ? document(tab.noteId, savedContent?.[tab.noteId]) : undefined));
  const hook = renderHook(({ scope }) => {
    const workspace = useNoteWorkspaceTabs(scope);
    const attach = useTabImageUploads({
      scopeKey: workspace.state.scopeKey,
      getTabDocument: (tab: OpenNoteTab) => ('noteId' in tab ? document(tab.noteId, savedContent?.[tab.noteId]) : undefined),
      getWorkspaceSnapshot: workspace.getWorkspaceSnapshot,
      replaceTabPlaceholder: workspace.replaceTabPlaceholder,
      readTabDocument,
      uploadImage,
    });
    return { workspace, attach };
  }, { initialProps: { scope: initialScope } });
  return { ...hook, upload, uploadImage, readTabDocument };
}

function openWithDraft(result: { current: { workspace: ReturnType<typeof useNoteWorkspaceTabs> } }, id: string, content: string) {
  act(() => { result.current.workspace.openNote(note(id)); });
  const tab = result.current.workspace.activeTab!;
  act(() => { result.current.workspace.updateDraft(tab.tabId, { title: id, content, baseTitle: id, baseContent: '' }); });
  return tab;
}

describe('image uploads finish in their own tab', () => {
  it('replaces only its placeholder after switching tabs, keeping later edits and other tabs', async () => {
    const { result, upload } = setup();
    const origin = openWithDraft(result, 'a', `Intro ${PLACEHOLDER}`);
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.attach(origin, imageFile(), PLACEHOLDER); });
    const other = openWithDraft(result, 'b', `Other ${PLACEHOLDER}`);
    act(() => { result.current.workspace.updateDraft(origin.tabId, { ...result.current.workspace.state.drafts[origin.tabId], content: `Intro ${PLACEHOLDER} later edit` }); });

    upload.resolve({ link: 'https://assets.example/diagram.png' } as UploadNoteImageResult);
    await act(async () => { await pending; });

    expect(result.current.workspace.state.drafts[origin.tabId].content).toBe('Intro ![diagram.png](https://assets.example/diagram.png) later edit');
    expect(result.current.workspace.state.drafts[other.tabId].content).toBe(`Other ${PLACEHOLDER}`);
    expect(result.current.workspace.activeTab?.tabId).toBe(other.tabId);
  });

  it('removes its placeholder and reports a failed upload', async () => {
    const { result, upload } = setup();
    const origin = openWithDraft(result, 'a', `Text ${PLACEHOLDER}${OTHER}`);
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.attach(origin, imageFile(), PLACEHOLDER); });
    upload.reject(new Error('HackMD is having trouble right now.'));
    await act(async () => { await pending; });
    expect(result.current.workspace.state.drafts[origin.tabId].content).toBe(`Text ${OTHER}`);
    expect(toast.error).toHaveBeenCalledWith('HackMD is having trouble right now.');
  });

  it('does not insert when the placeholder was edited or removed', async () => {
    const { result, upload } = setup();
    const origin = openWithDraft(result, 'a', `Text ${PLACEHOLDER}`);
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.attach(origin, imageFile(), PLACEHOLDER); });
    act(() => { result.current.workspace.updateDraft(origin.tabId, { ...result.current.workspace.state.drafts[origin.tabId], content: 'Text ![Uploading image 1a2b' }); });
    upload.resolve({ link: 'https://assets.example/diagram.png' } as UploadNoteImageResult);
    await act(async () => { await pending; });
    expect(result.current.workspace.state.drafts[origin.tabId].content).toBe('Text ![Uploading image 1a2b');
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('placeholder was changed'), { description: '![diagram.png](https://assets.example/diagram.png)' });
  });

  it('discards the result when the originating tab was closed', async () => {
    const { result, upload } = setup();
    const origin = openWithDraft(result, 'a', `Text ${PLACEHOLDER}`);
    const other = openWithDraft(result, 'b', `Same text ${PLACEHOLDER}`);
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.attach(origin, imageFile(), PLACEHOLDER); });
    act(() => { result.current.workspace.closeTab(origin.tabId); });
    upload.resolve({ link: 'https://assets.example/diagram.png' } as UploadNoteImageResult);
    await act(async () => { await pending; });
    expect(result.current.workspace.state.tabs[origin.tabId]).toBeUndefined();
    expect(result.current.workspace.state.drafts[other.tabId].content).toBe(`Same text ${PLACEHOLDER}`);
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('after its tab was closed'));
  });

  it('finishes in the original workspace after switching workspaces', async () => {
    const { result, rerender, upload } = setup('team:a');
    const origin = openWithDraft(result, 'a', `Team A ${PLACEHOLDER}`);
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.attach(origin, imageFile(), PLACEHOLDER); });
    rerender({ scope: 'team:b' });
    const other = openWithDraft(result, 'b', `Team B ${PLACEHOLDER}`);
    const teamB = result.current.workspace.state;
    upload.resolve({ link: 'https://assets.example/diagram.png' } as UploadNoteImageResult);
    await act(async () => { await pending; });
    expect(result.current.workspace.state).toEqual(teamB);
    expect(result.current.workspace.state.drafts[other.tabId].content).toBe(`Team B ${PLACEHOLDER}`);
    rerender({ scope: 'team:a' });
    expect(result.current.workspace.state.drafts[origin.tabId].content).toBe('Team A ![diagram.png](https://assets.example/diagram.png)');
  });

  it('updates the saved content when the note was saved with the placeholder', async () => {
    const { result, upload, readTabDocument } = setup('personal', { a: `Saved ${PLACEHOLDER}` });
    act(() => { result.current.workspace.openNote(note('a')); });
    const origin = result.current.workspace.activeTab!;
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.attach(origin, imageFile(), PLACEHOLDER); });
    upload.resolve({ link: 'https://assets.example/diagram.png' } as UploadNoteImageResult);
    await act(async () => { await pending; });
    expect(result.current.workspace.state.drafts[origin.tabId]).toMatchObject({
      content: 'Saved ![diagram.png](https://assets.example/diagram.png)',
      baseContent: `Saved ${PLACEHOLDER}`,
    });
    expect(readTabDocument).not.toHaveBeenCalled();
  });

  it('updates a saved note in a workspace that is no longer visible', async () => {
    const { result, rerender, upload, readTabDocument } = setup('team:a', { a: `Saved ${PLACEHOLDER}` });
    act(() => { result.current.workspace.openNote(note('a')); });
    const origin = result.current.workspace.activeTab!;
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.attach(origin, imageFile(), PLACEHOLDER); });
    rerender({ scope: 'team:b' });
    const teamB = result.current.workspace.state;
    upload.resolve({ link: 'https://assets.example/diagram.png' } as UploadNoteImageResult);
    await act(async () => { await pending; });
    expect(readTabDocument).toHaveBeenCalledWith('team:a', origin);
    expect(result.current.workspace.state).toEqual(teamB);
    expect(toast.info).not.toHaveBeenCalled();
    rerender({ scope: 'team:a' });
    expect(result.current.workspace.state.drafts[origin.tabId].content).toBe('Saved ![diagram.png](https://assets.example/diagram.png)');
  });

  it('rejects an attachment for an unsaved draft and removes its placeholder', async () => {
    const { result, uploadImage } = setup();
    act(() => { result.current.workspace.openDraftNote({ content: `Draft ${PLACEHOLDER}` }); });
    const draftTab = result.current.workspace.activeTab!;
    await act(async () => { await result.current.attach(draftTab, imageFile(), PLACEHOLDER); });
    expect(uploadImage).not.toHaveBeenCalled();
    expect(result.current.workspace.state.drafts[draftTab.tabId].content).toBe('Draft ');
    expect(toast.error).toHaveBeenCalledWith('Save the draft before attaching images.');
  });
});
