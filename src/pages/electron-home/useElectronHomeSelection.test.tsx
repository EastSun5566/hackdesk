import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, NoteSummary } from '@/lib/electron-api';

import type { OpenNoteTab } from './note-workspace';
import {
  useElectronHomeSelection,
  useElectronHomeSelectionRefs,
  useSelectedDocumentEditorFocus,
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

function document(input: Partial<DocumentSummary> & Pick<DocumentSummary, 'id' | 'title'>): DocumentSummary {
  return {
    ...note(input),
    commentPermission: input.commentPermission ?? 'disabled',
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

  it('bumps editor focus once immediately and once when the selected document is ready', async () => {
    const openNoteInWorkspace = vi.fn();
    const trackRecentNote = vi.fn();
    const selectedNote = note({ id: 'note-a', title: 'Alpha' });
    const selectedDocument = document({ id: 'note-a', title: 'Alpha' });
    const { result, rerender } = renderHook(({ doc }: { doc?: DocumentSummary }) => {
      const selectionRefs = useElectronHomeSelectionRefs();
      const selection = useElectronHomeSelection({
        activeTab: null,
        openNoteInWorkspace,
        selectionRefs,
        trackRecentNote,
      });
      useSelectedDocumentEditorFocus(doc, selection.handleSelectedDocumentReady);
      return selection;
    }, { initialProps: { doc: undefined } });

    await act(async () => {
      await result.current.requestSelectNote(selectedNote, { focusEditor: true });
    });

    expect(result.current.editorFocusRequestId).toBe(1);

    rerender({ doc: selectedDocument });

    expect(result.current.editorFocusRequestId).toBe(2);

    rerender({ doc: selectedDocument });

    expect(result.current.editorFocusRequestId).toBe(2);
  });
});
