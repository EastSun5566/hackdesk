import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';

import type { SavedOpenNoteTab } from './note-workspace';
import { setFocusEditorOnOpen } from './note-focus-preference';
import {
  useElectronHomeSelection,
  useElectronHomeSelectionRefs,
} from './useElectronHomeSelection';

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: input.content ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    description: input.description ?? '',
    folderPaths: input.folderPaths ?? [],
    id: input.id,
    lastChangeUser: input.lastChangeUser ?? null,
    permalink: input.permalink ?? null,
    publishLink: input.publishLink ?? `https://hackmd.io/${input.id}`,
    publishedAtMillis: input.publishedAtMillis ?? null,
    publishType: input.publishType ?? 'edit',
    readPermission: input.readPermission ?? 'owner',
    shortId: input.shortId ?? input.id,
    tags: input.tags ?? [],
    tagsUpdatedAtMillis: input.tagsUpdatedAtMillis ?? null,
    teamPath: input.teamPath ?? null,
    title: input.title,
    titleUpdatedAtMillis: input.titleUpdatedAtMillis ?? null,
    updatedAtMillis: input.updatedAtMillis ?? null,
    userPath: input.userPath ?? null,
    writePermission: input.writePermission ?? 'owner',
  };
}

function tab(input: Partial<SavedOpenNoteTab> & Pick<SavedOpenNoteTab, 'noteId' | 'title'>): SavedOpenNoteTab {
  return {
    noteId: input.noteId,
    shortId: input.shortId ?? input.noteId,
    tabId: input.tabId ?? `tab-${input.noteId}`,
    teamPath: input.teamPath ?? null,
    title: input.title,
    updatedAtMillis: input.updatedAtMillis ?? null,
  };
}

describe('useElectronHomeSelection', () => {
  it('keeps an already selected preview and respects the focus preference', async () => {
    const openNoteInWorkspace = vi.fn();
    const keepNoteInWorkspace = vi.fn();
    const requestEditorFocusOn = vi.fn();
    const selected = note({ id: 'note-a', title: 'Alpha' });
    setFocusEditorOnOpen(false);
    try {
      const { result } = renderHook(() => {
        const selectionRefs = useElectronHomeSelectionRefs();
        return useElectronHomeSelection({
          activePaneId: 'pane-a', activeTab: tab({ noteId: 'note-a', title: 'Alpha' }),
          requestEditorFocusOn, openNoteInWorkspace, keepNoteInWorkspace, selectionRefs,
          trackRecentNote: vi.fn(),
        });
      });
      await act(async () => { result.current.handleNoteSelect(selected); });
      expect(keepNoteInWorkspace).toHaveBeenCalledWith(selected);
      expect(openNoteInWorkspace).toHaveBeenCalledWith(selected, { inPlace: undefined, preview: false });
      expect(requestEditorFocusOn).not.toHaveBeenCalled();
    } finally {
      setFocusEditorOnOpen(true);
    }
  });

  it('derives selected note from the active tab', () => {
    const openNoteInWorkspace = vi.fn();
    const trackRecentNote = vi.fn();
    const { result } = renderHook(() => {
      const selectionRefs = useElectronHomeSelectionRefs();
      return useElectronHomeSelection({
        activePaneId: 'pane-a',
        requestEditorFocusOn: vi.fn(),
        activeTab: tab({ noteId: 'note-a', teamPath: 'team-a', title: 'Alpha' }),
        openNoteInWorkspace,
        selectionRefs,
        trackRecentNote,
      });
    });

    expect(result.current.selectedNote).toEqual({ id: 'note-a', teamPath: 'team-a' });
  });

  it('opens notes, tracks recent entries, and can skip recent tracking', async () => {
    const openNoteInWorkspace = vi.fn();
    const trackRecentNote = vi.fn();
    const selectedNote = note({ id: 'note-a', title: 'Alpha' });
    const untrackedNote = note({ id: 'note-b', title: 'Beta' });
    const { result } = renderHook(() => {
      const selectionRefs = useElectronHomeSelectionRefs();
      return useElectronHomeSelection({
        activePaneId: 'pane-a',
        requestEditorFocusOn: vi.fn(),
        activeTab: null,
        openNoteInWorkspace,
        selectionRefs,
        trackRecentNote,
      });
    });

    await act(async () => {
      await result.current.requestSelectNote(selectedNote);
      await result.current.requestSelectNote(untrackedNote, { trackRecent: false });
    });

    expect(openNoteInWorkspace).toHaveBeenCalledWith(selectedNote, { inPlace: undefined });
    expect(openNoteInWorkspace).toHaveBeenCalledWith(untrackedNote, { inPlace: undefined });
    expect(trackRecentNote).toHaveBeenCalledTimes(1);
    expect(trackRecentNote).toHaveBeenCalledWith(selectedNote);
  });

  it('asks focus for the picked note where it opens: the active pane, in this workspace', async () => {
    const requestEditorFocusOn = vi.fn();
    const { result } = renderHook(() => useElectronHomeSelection({
      activePaneId: 'pane-a', scopeStorageKey: 'personal', activeTab: null, requestEditorFocusOn,
      openNoteInWorkspace: vi.fn(), selectionRefs: useElectronHomeSelectionRefs(), trackRecentNote: vi.fn(),
    }));
    await act(async () => { await result.current.requestSelectNote(note({ id: 'note-a', title: 'Alpha' }), { focusEditor: true }); });
    expect(requestEditorFocusOn).toHaveBeenCalledExactlyOnceWith({ scopeKey: 'personal', paneId: 'pane-a', documentId: 'note-a' });

    await act(async () => { await result.current.requestSelectNote(note({ id: 'note-b', title: 'Beta' })); });
    expect(requestEditorFocusOn).toHaveBeenCalledTimes(1);
  });

  it('asks focus in the pane that already has a tab for the note', async () => {
    const requestEditorFocusOn = vi.fn();
    const { result } = renderHook(() => useElectronHomeSelection({
      activePaneId: 'pane-a', scopeStorageKey: 'personal', activeTab: null, requestEditorFocusOn,
      getNotePaneId: () => 'pane-b',
      openNoteInWorkspace: vi.fn(), selectionRefs: useElectronHomeSelectionRefs(), trackRecentNote: vi.fn(),
    }));
    await act(async () => { await result.current.requestSelectNote(note({ id: 'note-b', title: 'Beta' }), { focusEditor: true }); });
    expect(requestEditorFocusOn).toHaveBeenCalledExactlyOnceWith({ scopeKey: 'personal', paneId: 'pane-b', documentId: 'note-b' });
  });

  it('asks no focus before a workspace is open', async () => {
    const requestEditorFocusOn = vi.fn();
    const { result } = renderHook(() => useElectronHomeSelection({
      activePaneId: 'pane-a', scopeStorageKey: null, activeTab: null, requestEditorFocusOn,
      openNoteInWorkspace: vi.fn(), selectionRefs: useElectronHomeSelectionRefs(), trackRecentNote: vi.fn(),
    }));
    await act(async () => { await result.current.requestSelectNote(note({ id: 'note-a', title: 'Alpha' }), { focusEditor: true }); });
    expect(requestEditorFocusOn).not.toHaveBeenCalled();
  });
});
