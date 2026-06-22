import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudOff, Copy, Download, Edit3, Loader2, PanelRightClose, PanelRightOpen, Save, Share2, Trash2 } from 'lucide-react';

import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/MarkdownEditor';
import { MarkdownReader } from '@/components/MarkdownReader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type {
  DocumentSummary,
  NoteSummary,
  UpdateNoteInput,
  UploadNoteImageInput,
  UploadNoteImageResult,
} from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

import { EmptyState, PanelHeader, PanelShell, ToolbarDropdownMoreTrigger, ToolbarIconButton } from './interaction-primitives';
import { NoteInspector } from './NoteInspector';
import { ShareDialog } from './ShareDialog';
import {
  formatDate,
  getFolderPathLabel,
} from './ui';
import {
  INSPECTOR_WIDTH_DEFAULT,
  type ReaderMode,
} from './ui-preferences';

const NOTE_INSPECTOR_PANEL_ID = 'note-inspector-panel';

export type DocumentSyncState = 'idle' | 'loading' | 'cached' | 'saving' | 'saved' | 'save_failed' | 'conflict';

const SYNC_STATE_LABELS: Record<DocumentSyncState, string> = {
  idle: 'Unsaved',
  loading: 'Loading',
  cached: 'Cached',
  saving: 'Saving',
  saved: 'Saved',
  save_failed: 'Save failed',
  conflict: 'Conflict',
};

function SyncStateBadge({
  state,
}: {
  state: DocumentSyncState;
}) {
  const className = {
    idle: 'border-border-default bg-background-default text-text-subtle',
    loading: 'border-border-default bg-background-default text-text-subtle',
    cached: 'border-primary-default/30 bg-primary-soft text-primary-default',
    saving: 'border-primary-default/30 bg-primary-soft text-primary-default',
    saved: 'border-success-default/30 bg-success-soft text-success-default',
    save_failed: 'border-destructive-default/30 bg-destructive-soft text-destructive-default',
    conflict: 'border-destructive-default/30 bg-destructive-soft text-destructive-default',
  }[state];
  const icon = state === 'loading' || state === 'saving'
    ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
    : state === 'cached'
      ? <CloudOff aria-hidden="true" className="h-3 w-3" />
      : state === 'save_failed' || state === 'conflict'
        ? <AlertCircle aria-hidden="true" className="h-3 w-3" />
        : <CheckCircle2 aria-hidden="true" className="h-3 w-3" />;

  return (
    <span
      className={cn('inline-flex h-7 shrink-0 items-center gap-1 rounded-[6px] border px-2 text-xs font-medium', className)}
      aria-label={`Sync state: ${SYNC_STATE_LABELS[state]}`}
    >
      {icon}
      {SYNC_STATE_LABELS[state]}
    </span>
  );
}

export function DocumentDetail({
  selectedNote,
  document,
  folderTree,
  title,
  content,
  isLoading,
  syncState = 'idle',
  readerMode,
  shareOpen,
  isInspectorCollapsed,
  onOpenEditor,
  onOpenExternal,
  onCopyLink,
  onCopyMarkdownLink,
  onExportMarkdown,
  onSave,
  onSaveMetadata,
  onSaveSharing,
  onUploadImage,
  onDelete,
  onTitleChange,
  onContentChange,
  onToggleInspector,
  onReaderModeChange,
  onShareOpenChange,
  isSaving,
  isSavingMetadata,
  isUploadingImage,
  isDeleting,
}: {
  selectedNote?: NoteSummary | null;
  document?: DocumentSummary;
  folderTree: FolderTree;
  title: string;
  content: string;
  isLoading: boolean;
  syncState?: DocumentSyncState;
  readerMode: ReaderMode;
  shareOpen: boolean;
  isInspectorCollapsed: boolean;
  onOpenEditor: (document: DocumentSummary) => void;
  onOpenExternal: (url: string) => void;
  onCopyLink: (document: DocumentSummary) => void;
  onCopyMarkdownLink: (document: DocumentSummary) => void;
  onExportMarkdown: (document: DocumentSummary, title: string, content: string) => void;
  onSave: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveSharing: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onUploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
  onDelete: (document: DocumentSummary) => void;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onToggleInspector: () => void;
  onReaderModeChange: (mode: ReaderMode) => void;
  onShareOpenChange: (open: boolean) => void;
  isSaving: boolean;
  isSavingMetadata: boolean;
  isUploadingImage: boolean;
  isDeleting: boolean;
}) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  const noteDirty = Boolean(document && (title !== document.title || content !== document.content));
  const openShareDialogFromMenu = () => {
    setActionsOpen(false);
    window.setTimeout(() => onShareOpenChange(true), 0);
  };

  if (isLoading) {
    return (
      <PanelShell
        focusZone="editor"
        className="h-full min-w-0 flex-1 bg-background-default"
      >
        {selectedNote ? (
          <PanelHeader
            className="px-4 py-2.5"
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
        className="px-4 py-2.5"
        titleElement="div"
        title={readerMode === 'read'
          ? <div className="truncate text-lg font-semibold">{title || 'Untitled'}</div>
          : (
            <label>
              <span className="sr-only">Note title</span>
              <input
                name="title"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
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
          </span>
        )}
        actions={(
          <>
            <SyncStateBadge state={syncState} />
            <div className="inline-flex rounded-md border border-border-default bg-background-default p-0.5" aria-label="View mode">
              <button
                type="button"
                onClick={() => onReaderModeChange('read')}
                aria-pressed={readerMode === 'read'}
                className={cn(
                  'h-8 rounded-[5px] px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default',
                  readerMode === 'read' ? 'bg-background-selected text-text-default' : 'text-text-subtle hover:text-text-default',
                )}
              >
                View
              </button>
              <button
                type="button"
                onClick={() => onReaderModeChange('edit')}
                aria-pressed={readerMode === 'edit'}
                className={cn(
                  'h-8 rounded-[5px] px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default',
                  readerMode === 'edit' ? 'bg-background-selected text-text-default' : 'text-text-subtle hover:text-text-default',
                )}
              >
                Edit
              </button>
            </div>
            <ToolbarIconButton
              disabled={isSaving || !noteDirty}
              title={!noteDirty ? 'No unsaved note changes.' : undefined}
              onClick={() => onSave(document, { title, content })}
              label="Save"
              tooltip={noteDirty ? 'Save note' : 'No unsaved note changes.'}
              className={noteDirty ? 'bg-primary-default text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground' : undefined}
            >
              {isSaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
            </ToolbarIconButton>
            <ToolbarIconButton
              onClick={onToggleInspector}
              aria-controls={NOTE_INSPECTOR_PANEL_ID}
              aria-expanded={!isInspectorCollapsed}
              label={isInspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
            >
              {isInspectorCollapsed ? <PanelRightOpen aria-hidden="true" className="h-4 w-4" /> : <PanelRightClose aria-hidden="true" className="h-4 w-4" />}
            </ToolbarIconButton>
            <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
              <ToolbarDropdownMoreTrigger />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onOpenEditor(document)}>
                  <Edit3 aria-hidden="true" className="h-4 w-4" />
                  Web Editor
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(event) => {
                  event.preventDefault();
                  openShareDialogFromMenu();
                }}>
                  <Share2 aria-hidden="true" className="h-4 w-4" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onExportMarkdown(document, title, content)}>
                  <Download aria-hidden="true" className="h-4 w-4" />
                  Export Markdown
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onCopyLink(document)}>
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Copy HackMD Link
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCopyMarkdownLink(document)}>
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Copy Markdown Link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive disabled={isDeleting} onSelect={() => onDelete(document)}>
                  {isDeleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      />

      <div className="flex min-h-0 flex-1">
        {readerMode === 'read' ? (
          <MarkdownReader value={content} onOpenExternal={onOpenExternal} />
        ) : (
          <MarkdownEditor ref={editorRef} value={content} onChange={onContentChange} />
        )}
        <div
          id={NOTE_INSPECTOR_PANEL_ID}
          aria-hidden={isInspectorCollapsed}
          className={cn(
            'shrink-0 overflow-hidden bg-background-muted transition-[width,border-color,background-color] duration-200 ease-out motion-reduce:transition-none',
            isInspectorCollapsed ? 'border-l-0' : 'border-l border-border-default',
          )}
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
              onInsertMarkdown={(markdown) => {
                if (editorRef.current) {
                  editorRef.current.insertText(markdown);
                  return;
                }

                onContentChange(`${content}${markdown}`);
              }}
            />
          )}
        </div>
      </div>

      <ShareDialog
        open={shareOpen}
        document={document}
        isSaving={isSavingMetadata}
        onOpenChange={onShareOpenChange}
        onCopyLink={onCopyLink}
        onCopyMarkdownLink={onCopyMarkdownLink}
        onOpenEditor={onOpenEditor}
        onSaveSharing={onSaveSharing}
      />
    </PanelShell>
  );
}
