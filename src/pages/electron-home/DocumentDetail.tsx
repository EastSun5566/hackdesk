import { useEffect, useRef, useState } from 'react';
import { Edit3, Loader2, PanelRightClose, PanelRightOpen, Save, Trash2 } from 'lucide-react';

import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/MarkdownEditor';
import type { DocumentSummary, UpdateNoteInput, UploadNoteImageInput, UploadNoteImageResult } from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';

import { NoteInspector } from './NoteInspector';
import {
  FOCUS_RING_CLASS,
  ICON_BUTTON_CLASS,
  PANEL_TRANSITION_CLASS,
  PRESSED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  formatDate,
  getFolderPathLabel,
} from './ui';
import {
  INSPECTOR_COLLAPSED_KEY,
  INSPECTOR_WIDTH_DEFAULT,
  readBooleanStorage,
  writeBooleanStorage,
} from './ui-preferences';

const NOTE_INSPECTOR_PANEL_ID = 'note-inspector-panel';

export function DocumentDetail({
  document,
  folderTree,
  isLoading,
  onOpenEditor,
  onSave,
  onSaveMetadata,
  onUploadImage,
  onDelete,
  isSaving,
  isSavingMetadata,
  isUploadingImage,
  isDeleting,
}: {
  document?: DocumentSummary;
  folderTree: FolderTree;
  isLoading: boolean;
  onOpenEditor: (document: DocumentSummary) => void;
  onSave: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onUploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
  onDelete: (document: DocumentSummary) => void;
  isSaving: boolean;
  isSavingMetadata: boolean;
  isUploadingImage: boolean;
  isDeleting: boolean;
}) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(() => (
    readBooleanStorage(INSPECTOR_COLLAPSED_KEY, true)
  ));

  useEffect(() => {
    setTitle(document?.title ?? '');
    setContent(document?.content ?? '');
  }, [document?.id, document?.title, document?.content]);

  const toggleInspector = () => {
    setIsInspectorCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(INSPECTOR_COLLAPSED_KEY, next);
      return next;
    });
  };

  if (isLoading) {
    return (
      <section className="flex h-full flex-1 items-center justify-center text-text-subtle">
        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
        Loading note…
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
          <Edit3 aria-hidden="true" className="h-4 w-4" />
          Web Editor
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onSave(document, { title, content })}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
          Save
        </button>
        <button
          type="button"
          onClick={toggleInspector}
          className={ICON_BUTTON_CLASS}
          aria-controls={NOTE_INSPECTOR_PANEL_ID}
          aria-expanded={!isInspectorCollapsed}
          aria-label={isInspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
          title={isInspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
        >
          {isInspectorCollapsed ? <PanelRightOpen aria-hidden="true" className="h-4 w-4" /> : <PanelRightClose aria-hidden="true" className="h-4 w-4" />}
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => onDelete(document)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive-default text-destructive-default transition-colors active:bg-destructive-soft ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
          aria-label="Delete note"
        >
          {isDeleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <MarkdownEditor ref={editorRef} value={content} onChange={setContent} />
        <div
          id={NOTE_INSPECTOR_PANEL_ID}
          aria-hidden={isInspectorCollapsed}
          className={`shrink-0 overflow-hidden bg-background-muted ${PANEL_TRANSITION_CLASS} ${
            isInspectorCollapsed ? 'border-l-0' : 'border-l border-border-default'
          }`}
          style={{ width: isInspectorCollapsed ? 0 : INSPECTOR_WIDTH_DEFAULT }}
        >
          {isInspectorCollapsed ? null : (
            <NoteInspector
              document={document}
              folderTree={folderTree}
              isSaving={isSavingMetadata}
              isUploading={isUploadingImage}
              onSaveMetadata={onSaveMetadata}
              onUploadImage={onUploadImage}
              onInsertMarkdown={(markdown) => editorRef.current?.insertText(markdown)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
