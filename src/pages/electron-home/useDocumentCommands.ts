import { useCallback } from 'react';
import { toast } from 'sonner';

import type {
  CreateNoteInput,
  DocumentSummary,
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import {
  getHackmdNoteUrl,
  getMarkdownNoteLink,
} from '@/lib/electron-note-links';
import {
  buildMarkdownExportInput,
  buildMarkdownImportInput,
} from '@/lib/electron-note-portability';

import { noteIdentityMatches, type NoteIdentity } from './note-workspace';
import type { WorkspaceScope } from './types';

function createDeleteNoteTarget(note: NoteSummary): DocumentSummary {
  return {
    ...note,
    content: note.content ?? '',
  };
}

async function writeClipboardText(api: HackDeskElectronAPI | undefined, text: string) {
  if (api?.app.writeClipboardText) {
    await api.app.writeClipboardText(text);
    return;
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard is unavailable.');
  }

  await navigator.clipboard.writeText(text);
}

export type DocumentCommandOptions = {
  api?: HackDeskElectronAPI;
  deleteNote: (note: DocumentSummary) => void;
  documentContent: string;
  documentTitle: string;
  duplicateNote: (note: NoteSummary) => void;
  importMarkdownNote: (input: CreateNoteInput) => void;
  scopeType: WorkspaceScope['type'];
  selectedDocument?: DocumentSummary;
  selectedNote: NoteIdentity | null;
  selectedParentFolderId?: string;
  setDeleteTarget: (note: DocumentSummary | null) => void;
  trackRecentNote: (note: NoteSummary) => void;
};

export function useDocumentCommands({
  api,
  deleteNote,
  documentContent,
  documentTitle,
  duplicateNote,
  importMarkdownNote,
  scopeType,
  selectedDocument,
  selectedNote,
  selectedParentFolderId,
  setDeleteTarget,
  trackRecentNote,
}: DocumentCommandOptions) {
  const handleExportMarkdown = useCallback((_note: DocumentSummary, title: string, content: string) => {
    if (!api) {
      return;
    }

    void api.app.saveTextFile(buildMarkdownExportInput(title, content))
      .then((filePath) => {
        if (filePath) {
          toast.success(`Note exported to ${filePath}`);
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to export note.');
      });
  }, [api]);

  const handleExportNoteMarkdown = useCallback((note: NoteSummary) => {
    if (!api) {
      return;
    }

    if (noteIdentityMatches(note, selectedNote) && selectedDocument) {
      handleExportMarkdown(selectedDocument, documentTitle, documentContent);
      return;
    }

    void api.hackmd.getNote(note.id, note.teamPath ?? null)
      .then((result) => {
        if (result.source === 'error') {
          throw new Error(result.error);
        }

        return api.app.saveTextFile(buildMarkdownExportInput(result.data.title, result.data.content));
      })
      .then((filePath) => {
        if (filePath) {
          toast.success(`Note exported to ${filePath}`);
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to export note.');
      });
  }, [api, documentContent, documentTitle, handleExportMarkdown, selectedDocument, selectedNote]);

  const handleImportMarkdownNote = useCallback(() => {
    if (!api) {
      return;
    }

    if (scopeType === 'history') {
      toast.info('Choose My Workspace or a team before importing notes.');
      return;
    }

    void api.app.openTextFile({
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    }).then((file) => {
      if (!file) {
        return;
      }

      importMarkdownNote(buildMarkdownImportInput(file, selectedParentFolderId));
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to import markdown note.');
    });
  }, [api, importMarkdownNote, scopeType, selectedParentFolderId]);

  const handleDeleteRequest = useCallback((note: NoteSummary) => {
    const deleteTarget = createDeleteNoteTarget(note);
    if (!api?.app.confirm) {
      setDeleteTarget(deleteTarget);
      return;
    }

    api.app.confirm({
      title: 'Delete Note',
      message: `Delete “${deleteTarget.title || 'Untitled'}”?`,
      detail: 'This removes the note from HackMD. This action cannot be undone from HackDesk.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    }).then(({ confirmed }) => {
      if (confirmed) {
        deleteNote(deleteTarget);
      }
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm note deletion.');
    });
  }, [api, deleteNote, setDeleteTarget]);

  const handleOpenEditor = useCallback((note: NoteSummary) => {
    if (!api) {
      return;
    }

    trackRecentNote(note);
    void Promise.resolve(api.shell.openHackmdEditor(note)).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to open HackMD editor.');
    });
  }, [api, trackRecentNote]);

  const handleOpenExternal = useCallback((url: string) => {
    if (!api) {
      return;
    }

    void Promise.resolve(api.shell.openExternal(url)).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to open link.');
    });
  }, [api]);

  const handleCopyNoteLink = useCallback((note: NoteSummary) => {
    void writeClipboardText(api, getHackmdNoteUrl(note))
      .then(() => toast.success('Link copied.'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy link.'));
  }, [api]);

  const handleCopyNoteMarkdownLink = useCallback((note: NoteSummary) => {
    void writeClipboardText(api, getMarkdownNoteLink(note))
      .then(() => toast.success('Markdown link copied.'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy markdown link.'));
  }, [api]);

  const handleDuplicateNote = useCallback((note: NoteSummary) => {
    duplicateNote(note);
  }, [duplicateNote]);

  return {
    handleCopyNoteLink,
    handleCopyNoteMarkdownLink,
    handleDeleteRequest,
    handleDuplicateNote,
    handleExportMarkdown,
    handleExportNoteMarkdown,
    handleImportMarkdownNote,
    handleOpenEditor,
    handleOpenExternal,
  };
}
