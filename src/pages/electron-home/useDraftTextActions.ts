import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

import type { HackDeskElectronAPI } from '@/lib/electron-api';
import { buildMarkdownExportInput } from '@/lib/electron-note-portability';

import { writeClipboardText } from './useDocumentCommands';

/** Copy or export draft text that has no usable note behind it. */
export function useDraftTextActions(api?: HackDeskElectronAPI) {
  const copyDraftText = useCallback((content: string) => {
    void writeClipboardText(api, content)
      .then(() => toast.success('Draft copied.'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to copy draft.'));
  }, [api]);

  const exportDraftText = useCallback((title: string, content: string) => {
    if (!api) return;
    void api.app.saveTextFile(buildMarkdownExportInput(title, content))
      .then((filePath) => {
        if (filePath) toast.success('Draft exported.', { description: filePath });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to export draft.'));
  }, [api]);

  return { copyDraftText, exportDraftText };
}
