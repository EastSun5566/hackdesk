import { useCallback } from 'react';
import { writeClipboardText } from '@/lib/clipboard';
import { toast } from '@/components/ui/toast';

import type {
  CreateNoteInput,
  DocumentSummary,
  HackDeskElectronAPI,
  NoteSummary,
} from '@/lib/electron-api';
import {
  getHackmdNoteUrl,
  getMarkdownNoteLink,
  toOpenHackmdEditorInput,
} from '@/lib/electron-note-links';
import {
  buildMarkdownExportInput,
  buildMarkdownImportInput,
} from '@/lib/electron-note-portability';

import { noteIdentityMatches, type NoteIdentity } from './note-workspace';
import type { WorkspaceScope } from './types';
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

/** Puts a note's Markdown on the clipboard and says so. */
export function copyNoteContentText(api: HackDeskElectronAPI | undefined, content: string) {
  return writeClipboardText(api, content)
    .then(() => toast.success('Note content copied.'))
    .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy note content.'));
}

function createDeleteNoteTarget(note: NoteSummary): DocumentSummary {
  return {
    ...note,
    content: note.content ?? '',
  };
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
          toast.success('Note exported.', { description: filePath });
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

    if (note.teamPath === LOCAL_VAULT_TEAM_PATH) {
      void api.localVault.readNote(note.id)
        .then((document) => api.app.saveTextFile(buildMarkdownExportInput(document.title, document.content)))
        .then((filePath) => {
          if (filePath) {
            toast.success('Note exported.', { description: filePath });
          }
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to export note.');
        });
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
          toast.success('Note exported.', { description: filePath });
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
    // The in-app delete dialog asks, so the question matches the app rather than the system.
    setDeleteTarget(deleteTarget);

  }, [api, deleteNote, setDeleteTarget]);

  const handleOpenEditor = useCallback((note: NoteSummary) => {
    if (!api) {
      return;
    }

    if (note.teamPath === LOCAL_VAULT_TEAM_PATH) {
      toast.info('Local notes are already open in HackDesk.');
      return;
    }

    trackRecentNote(note);
    void Promise.resolve(api.shell.openHackmdEditor(toOpenHackmdEditorInput(note))).catch((error) => {
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
    if (note.teamPath === LOCAL_VAULT_TEAM_PATH) {
      toast.info('Local notes do not have a HackMD link yet.');
      return;
    }

    void writeClipboardText(api, getHackmdNoteUrl(note))
      .then(() => toast.success('Link copied.'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy link.'));
  }, [api]);

  const handleCopyNoteMarkdownLink = useCallback((note: NoteSummary) => {
    if (note.teamPath === LOCAL_VAULT_TEAM_PATH) {
      toast.info('Local notes do not have a HackMD link yet.');
      return;
    }

    void writeClipboardText(api, getMarkdownNoteLink(note))
      .then(() => toast.success('Markdown link copied.'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy markdown link.'));
  }, [api]);

  /** The open note copies what its editor shows; any other note is read first, as export does. */
  const handleCopyNoteContent = useCallback((note: NoteSummary) => {
    if (noteIdentityMatches(note, selectedNote) && selectedDocument) {
      void copyNoteContentText(api, documentContent);
      return;
    }

    const read = note.teamPath === LOCAL_VAULT_TEAM_PATH
      ? api?.localVault.readNote(note.id).then((document) => document.content)
      : api?.hackmd.getNote(note.id, note.teamPath ?? null).then((result) => {
        if (result.source === 'error') throw new Error(result.error);
        return result.data.content;
      });
    if (!read) return;
    void read
      .then((content) => copyNoteContentText(api, content))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy note content.'));
  }, [api, documentContent, selectedDocument, selectedNote]);

  const handleDuplicateNote = useCallback((note: NoteSummary) => {
    duplicateNote(note);
  }, [duplicateNote]);

  return {
    handleCopyNoteContent,
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
