import { useCallback, useMemo, useState } from 'react';

import { toast } from '@/components/ui/toast';
import type { DocumentSummary, HackDeskElectronAPI, NoteSummary } from '@/lib/electron-api';
import type { FolderTree, FolderTreeNote } from '@/lib/hackmd-folders';
import { findTemplatesFolder, listTemplates } from '@/lib/note-templates';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';

/** A template's text: read from the vault, or from HackMD (its cached copy when offline). */
export async function readTemplateContent(api: HackDeskElectronAPI, note: NoteSummary) {
  if (note.teamPath === LOCAL_VAULT_TEAM_PATH) return (await api.localVault.readNote(note.id)).content;
  const result = await api.hackmd.getNote(note.id, note.teamPath);
  if (result.source === 'error' && !result.data) throw new Error(result.error);
  return result.data!.content;
}

/**
 * Templates are the notes in the workspace's Templates folder. A new note from one opens as a draft
 * with its text, saved like any new note; Save as Template copies the open note into that folder.
 */
export function useNoteTemplates({ api, folderTree, openDraftNote, saveAsTemplate }: {
  api?: HackDeskElectronAPI;
  folderTree: FolderTree;
  openDraftNote: (draft: { title: string; content: string }) => void;
  saveAsTemplate: (input: { title: string; content: string; templatesFolderId: string | null }) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const templates = useMemo(() => listTemplates(folderTree), [folderTree]);

  const chooseTemplate = useCallback(async (template: FolderTreeNote) => {
    if (!api) return;
    try {
      const content = await readTemplateContent(api, template.note);
      setPickerOpen(false);
      openDraftNote({ title: template.note.title, content });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the template.');
    }
  }, [api, openDraftNote]);

  const saveDocumentAsTemplate = useCallback((document: DocumentSummary | undefined, draft: { title: string; content: string }) => {
    if (!document) return;
    saveAsTemplate({ ...draft, templatesFolderId: findTemplatesFolder(folderTree)?.id ?? null });
  }, [folderTree, saveAsTemplate]);

  return { templates, pickerOpen, setPickerOpen, chooseTemplate, saveDocumentAsTemplate };
}
