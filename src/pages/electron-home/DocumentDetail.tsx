import { useEffect, useState } from 'react';
import { Edit3, Loader2, Save, Trash2 } from 'lucide-react';

import { MarkdownEditor } from '@/components/MarkdownEditor';
import type { DocumentSummary } from '@/lib/electron-api';

import {
  FOCUS_RING_CLASS,
  PRESSED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  formatDate,
  getFolderPathLabel,
} from './ui';

export function DocumentDetail({
  document,
  isLoading,
  onOpenEditor,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  document?: DocumentSummary;
  isLoading: boolean;
  onOpenEditor: (document: DocumentSummary) => void;
  onSave: (document: DocumentSummary, input: { title: string; content: string }) => void;
  onDelete: (document: DocumentSummary) => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    setTitle(document?.title ?? '');
    setContent(document?.content ?? '');
  }, [document?.id, document?.title, document?.content]);

  if (isLoading) {
    return (
      <section className="flex h-full flex-1 items-center justify-center text-text-subtle">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading note
      </section>
    );
  }

  if (!document) {
    return (
      <section className="flex h-full flex-1 items-center justify-center text-sm text-text-subtle">
        Select a note.
      </section>
    );
  }

  return (
    <section
      data-hackdesk-focus="editor"
      tabIndex={-1}
      className="flex h-full min-w-0 flex-1 flex-col bg-background-default outline-none"
    >
      <header className="flex items-center gap-3 border-b border-border-default px-5 py-3">
        <div className="min-w-0 flex-1">
          <label>
            <span className="sr-only">Note title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full truncate bg-transparent text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary-default"
            />
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-subtle">
            <span>{formatDate(document.updatedAtMillis)}</span>
            <span>{document.readPermission} read</span>
            <span>{document.writePermission} write</span>
            {document.teamPath ? <span>@{document.teamPath}</span> : null}
            {document.folderPaths.length > 0 ? <span>{getFolderPathLabel(document.folderPaths)}</span> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenEditor(document)}
          className={SECONDARY_BUTTON_CLASS}
        >
          <Edit3 className="h-4 w-4" />
          Web Editor
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onSave(document, { title, content })}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => onDelete(document)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive-default text-destructive-default transition-colors active:bg-destructive-soft ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
          aria-label="Delete note"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </header>

      <MarkdownEditor value={content} onChange={setContent} />
    </section>
  );
}
