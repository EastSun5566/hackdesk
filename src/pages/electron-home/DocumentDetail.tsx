import { useEffect, useRef, useState } from 'react';
import { Download, Edit3, Loader2, PanelRightClose, PanelRightOpen, Save, Share2, Trash2 } from 'lucide-react';

import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/MarkdownEditor';
import type {
  DocumentSummary,
  ElectronActionId,
  NoteSummary,
  UpdateNoteInput,
  UploadNoteImageInput,
  UploadNoteImageResult,
} from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';

import { EmptyState, PanelHeader, PanelShell } from './interaction-primitives';
import { NoteInspector } from './NoteInspector';
import { ShareDialog } from './ShareDialog';
import {
  ICON_BUTTON_CLASS,
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

export type DocumentDetailCommand = {
  id: Extract<ElectronActionId, 'toggle-inspector' | 'focus-inspector' | 'save-note' | 'export-note-markdown' | 'open-note-web-editor' | 'delete-note'>;
  sequence: number;
};

export function DocumentDetail({
  selectedNote,
  document,
  folderTree,
  isLoading,
  command,
  onOpenEditor,
  onCopyLink,
  onCopyMarkdownLink,
  onExportMarkdown,
  onSave,
  onSaveMetadata,
  onSaveSharing,
  onUploadImage,
  onDelete,
  onDirtyStateChange,
  onInspectorCollapsedChange,
  isSaving,
  isSavingMetadata,
  isUploadingImage,
  isDeleting,
}: {
  selectedNote?: NoteSummary | null;
  document?: DocumentSummary;
  folderTree: FolderTree;
  isLoading: boolean;
  command?: DocumentDetailCommand | null;
  onOpenEditor: (document: DocumentSummary) => void;
  onCopyLink: (document: DocumentSummary) => void;
  onCopyMarkdownLink: (document: DocumentSummary) => void;
  onExportMarkdown: (document: DocumentSummary, title: string, content: string) => void;
  onSave: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveSharing: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onUploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
  onDelete: (document: DocumentSummary) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  onInspectorCollapsedChange?: (collapsed: boolean) => void;
  isSaving: boolean;
  isSavingMetadata: boolean;
  isUploadingImage: boolean;
  isDeleting: boolean;
}) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(() => (
    readBooleanStorage(INSPECTOR_COLLAPSED_KEY, true)
  ));

  useEffect(() => {
    setTitle(document?.title ?? '');
    setContent(document?.content ?? '');
  }, [document?.id, document?.title, document?.content]);

  const noteDirty = Boolean(document && (title !== document.title || content !== document.content));

  useEffect(() => {
    onDirtyStateChange?.(noteDirty);
  }, [noteDirty, onDirtyStateChange]);

  useEffect(() => {
    onInspectorCollapsedChange?.(isInspectorCollapsed);
  }, [isInspectorCollapsed, onInspectorCollapsedChange]);

  const toggleInspector = () => {
    setIsInspectorCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(INSPECTOR_COLLAPSED_KEY, next);
      return next;
    });
  };

  useEffect(() => {
    if (!document || !command) {
      return;
    }

    switch (command.id) {
    case 'toggle-inspector':
      toggleInspector();
      break;
    case 'focus-inspector':
      window.requestAnimationFrame(() => {
        window.document.querySelector<HTMLElement>('[data-hackdesk-focus="inspector"]')?.focus();
      });
      break;
    case 'save-note':
      if (noteDirty && !isSaving) {
        onSave(document, { title, content });
      }
      break;
    case 'export-note-markdown':
      onExportMarkdown(document, title, content);
      break;
    case 'open-note-web-editor':
      onOpenEditor(document);
      break;
    case 'delete-note':
      onDelete(document);
      break;
    }
  // command.sequence intentionally gates repeated command dispatches with the same action id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.sequence]);

  if (isLoading) {
    return (
      <PanelShell
        focusZone="editor"
        className="h-full min-w-0 flex-1 bg-background-default"
      >
        {selectedNote ? (
          <PanelHeader
            className="px-5 py-3"
            title={selectedNote.title || 'Untitled'}
            subtitle="Loading note…"
            titleElement="div"
          />
        ) : null}
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-text-subtle">
          <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          Loading note…
        </div>
      </PanelShell>
    );
  }

  if (!document) {
    return (
      <PanelShell className="h-full flex-1 bg-background-default">
        <EmptyState title="Select a note." />
      </PanelShell>
    );
  }

  return (
    <PanelShell
      focusZone="editor"
      className="h-full min-w-0 flex-1 bg-background-default"
    >
      <PanelHeader
        className="px-5 py-3"
        titleElement="div"
        title={(
          <label>
            <span className="sr-only">Note title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full truncate bg-transparent text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary-default"
            />
          </label>
        )}
        subtitle={(
          <span className="flex flex-wrap items-center gap-2">
            <span>{formatDate(document.updatedAtMillis)}</span>
            <span>{document.readPermission} read</span>
            <span>{document.writePermission} write</span>
            {document.teamPath ? <span>@{document.teamPath}</span> : null}
            {document.folderPaths.length > 0 ? <span>{getFolderPathLabel(document.folderPaths)}</span> : null}
            {noteDirty ? <span className="text-primary-default">Unsaved</span> : null}
          </span>
        )}
        actions={(
          <>
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
              onClick={() => setShareOpen(true)}
              className={SECONDARY_BUTTON_CLASS}
            >
              <Share2 aria-hidden="true" className="h-4 w-4" />
              Share
            </button>
            <button
              type="button"
              onClick={() => onExportMarkdown(document, title, content)}
              className={SECONDARY_BUTTON_CLASS}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Export
            </button>
            <button
              type="button"
              disabled={isSaving || !noteDirty}
              title={!noteDirty ? 'No unsaved note changes.' : undefined}
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
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive-default text-destructive-default transition-colors active:bg-destructive-soft ${PRESSED_CLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default disabled:pointer-events-none disabled:opacity-50`}
              aria-label="Delete note"
            >
              {isDeleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
            </button>
          </>
        )}
      />

      <div className="flex min-h-0 flex-1">
        <MarkdownEditor ref={editorRef} value={content} onChange={setContent} />
        <div
          id={NOTE_INSPECTOR_PANEL_ID}
          aria-hidden={isInspectorCollapsed}
          className={`shrink-0 overflow-hidden bg-background-muted transition-[width,border-color,background-color] duration-200 ease-out motion-reduce:transition-none ${
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
              onCopyLink={onCopyLink}
              onInsertMarkdown={(markdown) => editorRef.current?.insertText(markdown)}
            />
          )}
        </div>
      </div>

      <ShareDialog
        open={shareOpen}
        document={document}
        isSaving={isSavingMetadata}
        onOpenChange={setShareOpen}
        onCopyLink={onCopyLink}
        onCopyMarkdownLink={onCopyMarkdownLink}
        onOpenEditor={onOpenEditor}
        onSaveSharing={onSaveSharing}
      />
    </PanelShell>
  );
}
