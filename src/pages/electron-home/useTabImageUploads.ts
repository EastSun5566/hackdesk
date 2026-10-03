import { useCallback, useLayoutEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';

import { formatMarkdownImage } from '@/components/hackmd-live-preview/markdown-image';
import type { DocumentSummary, UploadNoteImageInput, UploadNoteImageResult } from '@/lib/electron-api';

import type { NoteWorkspaceState, OpenNoteTab } from './note-workspace';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export type TabImageUploadOptions = {
  scopeKey: string;
  getTabDocument: (tab: OpenNoteTab) => DocumentSummary | undefined;
  getWorkspaceSnapshot: (scopeKey: string) => NoteWorkspaceState | null;
  replaceTabDraftText: (scopeKey: string, tabId: string, placeholder: string, replacement: string) => void;
  setTabContent: (tab: OpenNoteTab, content: string) => void;
  uploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
};

/**
 * Finishes image uploads in the tab and workspace they started in. The editor
 * only inserts a unique placeholder; it may be gone by the time an upload ends.
 */
export function useTabImageUploads(options: TabImageUploadOptions) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });

  return useCallback(async (tab: OpenNoteTab, file: File, placeholder: string) => {
    const { scopeKey, getTabDocument, uploadImage } = latest.current;
    let markdown: string | null = null;
    let failure: string | null = null;
    try {
      const document = getTabDocument(tab);
      if (!document) throw new Error('Save the draft before attaching images.');
      if (file.size > MAX_IMAGE_BYTES) throw new Error('Images cannot exceed 25 MiB.');
      const result = await uploadImage(document, {
        bytes: await file.arrayBuffer(),
        fileName: file.name || 'image',
        mimeType: file.type || 'application/octet-stream',
      });
      markdown = formatMarkdownImage(file.name || 'image', result.link);
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Failed to insert image.';
    }

    // Let the placeholder insertion commit before reading the workspace.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const current = latest.current;
    const snapshot = current.getWorkspaceSnapshot(scopeKey);
    const replacement = markdown ?? '';
    if (failure) toast.error(failure);

    // Closing the tab cancels insertion; the result is never applied to another tab.
    if (!snapshot?.tabs[tab.tabId]) {
      if (markdown) toast.info('An image finished uploading after its tab was closed, so it was not inserted.');
      return;
    }

    if (snapshot.drafts[tab.tabId]?.content.includes(placeholder)) {
      current.replaceTabDraftText(scopeKey, tab.tabId, placeholder, replacement);
      return;
    }

    // The note may have been saved with the placeholder while the upload ran.
    const document = current.scopeKey === scopeKey && !snapshot.drafts[tab.tabId] ? current.getTabDocument(tab) : undefined;
    const index = document?.content.indexOf(placeholder) ?? -1;
    if (document && index >= 0) {
      current.setTabContent(tab, document.content.slice(0, index) + replacement + document.content.slice(index + placeholder.length));
      return;
    }

    // The user edited or removed the placeholder; do not guess where the image belongs.
    if (markdown) {
      toast.info('The image was uploaded, but its placeholder was changed, so it was not inserted.', { description: markdown });
    }
  }, []);
}
