import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NoteSummary } from '@/lib/electron-api';

import type { OpenNoteTab } from './note-workspace';
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

function tab(input: Partial<OpenNoteTab> & Pick<OpenNoteTab, 'noteId' | 'title'>): OpenNoteTab {
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
  it('derives selected note from the active tab', () => {
    const openNoteInWorkspace = vi.fn();
    const trackRecentNote = vi.fn();
    const { result } = renderHook(() => {
      const selectionRefs = useElectronHomeSelectionRefs();
      return useElectronHomeSelection({
        activePaneId: 'pane-a',
        requestEditorFocus: vi.fn(),
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
        requestEditorFocus: vi.fn(),
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

    expect(openNoteInWorkspace).toHaveBeenCalledWith(selectedNote);
    expect(openNoteInWorkspace).toHaveBeenCalledWith(untrackedNote);
    expect(trackRecentNote).toHaveBeenCalledTimes(1);
    expect(trackRecentNote).toHaveBeenCalledWith(selectedNote);
  });

  it('requests focus once for the selected tab without a document-ready replay', async () => {
    const requestEditorFocus = vi.fn();
    const selectedNote = note({ id: 'note-a', title: 'Alpha' });
    const { result, rerender } = renderHook(() => {
      const selectionRefs = useElectronHomeSelectionRefs();
      const [activeTab, setActiveTab] = useState<OpenNoteTab | null>(null);
      return useElectronHomeSelection({
        activePaneId: 'pane-a', scopeStorageKey: 'personal', activeTab, requestEditorFocus,
        openNoteInWorkspace: next => setActiveTab(tab({ noteId: next.id, title: next.title })),
        selectionRefs, trackRecentNote: vi.fn(),
      });
    });
    await act(async () => { await result.current.requestSelectNote(selectedNote, { focusEditor: true }); });
    expect(requestEditorFocus).toHaveBeenCalledTimes(1);
    rerender();
    expect(requestEditorFocus).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending selection focus when its pane or workspace changes', () => {
    const requestEditorFocus = vi.fn();
    const selectedNote = note({ id: 'note-a', title: 'Alpha' });
    const { result, rerender } = renderHook(({ paneId, scopeKey }) => {
      const selectionRefs = useElectronHomeSelectionRefs();
      const [activeTab, setActiveTab] = useState<OpenNoteTab | null>(null);
      return useElectronHomeSelection({
        activePaneId: paneId, scopeStorageKey: scopeKey, activeTab, requestEditorFocus,
        openNoteInWorkspace: next => setActiveTab(tab({ noteId: next.id, title: next.title })),
        selectionRefs, trackRecentNote: vi.fn(),
      });
    }, { initialProps: { paneId: 'pane-a', scopeKey: 'local:A' } });
    act(() => {
      void result.current.requestSelectNote(selectedNote, { focusEditor: true });
      rerender({ paneId: 'pane-b', scopeKey: 'local:B' });
    });
    expect(requestEditorFocus).not.toHaveBeenCalled();
    rerender({ paneId: 'pane-a', scopeKey: 'local:A' });
    expect(requestEditorFocus).not.toHaveBeenCalled();
  });

  it('focuses the host pane when the selected note already has a tab in another pane', async () => {
    const requestEditorFocus = vi.fn();
    const selectedNote = note({ id: 'note-b', title: 'Beta' });
    const { result } = renderHook(() => {
      const selectionRefs = useElectronHomeSelectionRefs();
      const [paneId, setPaneId] = useState('pane-a');
      const [activeTab, setActiveTab] = useState<OpenNoteTab | null>(null);
      return useElectronHomeSelection({
        activePaneId: paneId, scopeStorageKey: 'personal', activeTab, requestEditorFocus,
        getNotePaneId: () => 'pane-b',
        openNoteInWorkspace: next => {
          setActiveTab(tab({ noteId: next.id, title: next.title }));
          setPaneId('pane-b');
        },
        selectionRefs, trackRecentNote: vi.fn(),
      });
    });
    await act(async () => { await result.current.requestSelectNote(selectedNote, { focusEditor: true }); });
    expect(requestEditorFocus).toHaveBeenCalledTimes(1);
  });
});
