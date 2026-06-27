import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Copy,
  Download,
  Edit3,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Share2,
  Trash2,
} from 'lucide-react';

import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/MarkdownEditor';
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
import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import {
  INSPECTOR_WIDTH_DEFAULT,
} from './ui-preferences';

const NOTE_INSPECTOR_PANEL_ID = 'note-inspector-panel';

export type DocumentSyncState = 'idle' | 'loading' | 'cached' | 'saving' | 'saved' | 'save_failed' | 'conflict';

export type DocumentDetailDocumentState = {
  content: string;
  document?: DocumentSummary;
  selectedNote?: Pick<NoteSummary, 'title'> | null;
  syncState: DocumentSyncState;
  title: string;
};

export type DocumentDetailLayout = {
  focusZone?: string;
  focusRequestId: number;
  inspectorCollapsed: boolean;
  inspectorPanelId?: string;
  searchRequestId: number;
  shareOpen: boolean;
};

export type DocumentDetailStatus = {
  loading: boolean;
  deleting: boolean;
  saving: boolean;
  savingMetadata: boolean;
  uploadingImage: boolean;
};

export type DocumentDetailActions = {
  onContentChange: (content: string) => void;
  onCopyLink: (document: DocumentSummary) => void;
  onCopyMarkdownLink: (document: DocumentSummary) => void;
  onDelete: (document: DocumentSummary) => void;
  onExportMarkdown: (document: DocumentSummary, title: string, content: string) => void;
  onOpenEditor: (document: DocumentSummary) => void;
  onOpenExternal: (url: string) => void;
  onSave: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveSharing: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onShareOpenChange: (open: boolean) => void;
  onTitleChange: (title: string) => void;
  onToggleInspector: () => void;
  onUploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
};

export type DocumentDetailProps = {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState;
  folderTree: FolderTree;
  layout: DocumentDetailLayout;
  status: DocumentDetailStatus;
};

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
  actions,
  documentState,
  folderTree,
  layout,
  status,
}: DocumentDetailProps) {
  const focusZone = layout.focusZone ?? 'editor';

  if (status.loading) {
    return (
      <LoadingDocumentDetail
        focusZone={focusZone}
        selectedNote={documentState.selectedNote}
      />
    );
  }

  if (!documentState.document) {
    return <EmptyDocumentDetail />;
  }

  return (
    <ActiveDocumentDetail
      actions={actions}
      documentState={{ ...documentState, document: documentState.document }}
      focusZone={focusZone}
      folderTree={folderTree}
      layout={layout}
      status={status}
    />
  );
}

function LoadingDocumentDetail({
  focusZone,
  selectedNote,
}: {
  focusZone: string;
  selectedNote?: Pick<NoteSummary, 'title'> | null;
}) {
  return (
    <PanelShell
      focusZone={focusZone}
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6" aria-label="Loading note">
        <div className="h-4 w-2/3 animate-pulse rounded bg-background-selected motion-reduce:animate-none" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-background-selected motion-reduce:animate-none" />
        <div className="mt-4 space-y-3">
          <div className="h-3 w-full animate-pulse rounded bg-background-muted motion-reduce:animate-none" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-background-muted motion-reduce:animate-none" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-background-muted motion-reduce:animate-none" />
        </div>
      </div>
    </PanelShell>
  );
}

function EmptyDocumentDetail() {
  return (
    <PanelShell className="h-full flex-1 bg-background-default">
      <EmptyState title="Select a note." description="Choose a note from the navigator to read or edit it." />
    </PanelShell>
  );
}

function ActiveDocumentDetail({
  actions,
  documentState,
  focusZone,
  folderTree,
  layout,
  status,
}: {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState & { document: DocumentSummary };
  focusZone: string;
  folderTree: FolderTree;
  layout: DocumentDetailLayout;
  status: DocumentDetailStatus;
}) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const lastHandledFocusRequestRef = useRef(0);
  const lastHandledSearchRequestRef = useRef(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const inspectorPanelId = layout.inspectorPanelId ?? NOTE_INSPECTOR_PANEL_ID;
  const noteDirty = documentState.title !== documentState.document.title || documentState.content !== documentState.document.content;
  const isLocalDocument = documentState.document.teamPath === LOCAL_VAULT_TEAM_PATH;
  const focusEditorWhenReady = useCallback((requestId: number) => {
    let attempts = 0;
    const focusEditor = () => {
      const editor = editorRef.current;
      if (editor) {
        lastHandledFocusRequestRef.current = requestId;
        editor.focus();
        return;
      }

      if (attempts < 120) {
        attempts += 1;
        window.setTimeout(focusEditor, 0);
      }
    };

    focusEditor();
  }, []);
  const setEditorRef = useCallback((handle: MarkdownEditorHandle | null) => {
    editorRef.current = handle;
    if (handle && layout.focusRequestId > lastHandledFocusRequestRef.current) {
      focusEditorWhenReady(layout.focusRequestId);
    }
    if (handle && layout.searchRequestId > lastHandledSearchRequestRef.current) {
      lastHandledSearchRequestRef.current = layout.searchRequestId;
      handle.openSearch();
    }
  }, [focusEditorWhenReady, layout.focusRequestId, layout.searchRequestId]);

  useEffect(() => {
    if (layout.focusRequestId <= lastHandledFocusRequestRef.current) {
      return;
    }

    focusEditorWhenReady(layout.focusRequestId);
  }, [focusEditorWhenReady, layout.focusRequestId]);

  useEffect(() => {
    if (layout.searchRequestId <= lastHandledSearchRequestRef.current) {
      return;
    }

    lastHandledSearchRequestRef.current = layout.searchRequestId;
    editorRef.current?.openSearch();
  }, [layout.searchRequestId]);

  const openShareDialogFromMenu = () => {
    setActionsOpen(false);
    window.setTimeout(() => actions.onShareOpenChange(true), 0);
  };

  return (
    <PanelShell
      focusZone={focusZone}
      className="h-full min-w-0 flex-1 bg-background-default"
    >
      <DocumentHeader
        actions={actions}
        actionsOpen={actionsOpen}
        documentState={documentState}
        inspectorPanelId={inspectorPanelId}
        noteDirty={noteDirty}
        onActionsOpenChange={setActionsOpen}
        onOpenShareDialog={openShareDialogFromMenu}
        layout={layout}
        status={status}
      />

      <div className="flex min-h-0 flex-1">
        <DocumentBody
          content={documentState.content}
          onContentChange={actions.onContentChange}
          setEditorRef={setEditorRef}
        />
        <InspectorPanel
          actions={actions}
          content={documentState.content}
          document={documentState.document}
          editorRef={editorRef}
          folderTree={folderTree}
          inspectorCollapsed={layout.inspectorCollapsed}
          inspectorPanelId={inspectorPanelId}
          isLocalDocument={isLocalDocument}
          status={status}
        />
      </div>

      {isLocalDocument ? null : (
        <ShareDialog
          open={layout.shareOpen}
          document={documentState.document}
          isSaving={status.savingMetadata}
          onOpenChange={actions.onShareOpenChange}
          onCopyLink={actions.onCopyLink}
          onCopyMarkdownLink={actions.onCopyMarkdownLink}
          onOpenEditor={actions.onOpenEditor}
          onSaveSharing={actions.onSaveSharing}
        />
      )}
    </PanelShell>
  );
}

function DocumentHeader({
  actions,
  actionsOpen,
  documentState,
  inspectorPanelId,
  layout,
  noteDirty,
  onActionsOpenChange,
  onOpenShareDialog,
  status,
}: {
  actions: DocumentDetailActions;
  actionsOpen: boolean;
  documentState: DocumentDetailDocumentState & { document: DocumentSummary };
  inspectorPanelId: string;
  layout: DocumentDetailLayout;
  noteDirty: boolean;
  onActionsOpenChange: (open: boolean) => void;
  onOpenShareDialog: () => void;
  status: DocumentDetailStatus;
}) {
  const isLocalDocument = documentState.document.teamPath === LOCAL_VAULT_TEAM_PATH;

  return (
    <PanelHeader
      className="px-4 py-2.5"
      titleElement="div"
      title={(
        <label>
          <span className="sr-only">Note title</span>
          <input
            name="title"
            value={documentState.title}
            onChange={(event) => actions.onTitleChange(event.target.value)}
            className="w-full truncate bg-transparent text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary-default"
          />
        </label>
      )}
      subtitle={(
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums">{formatDate(documentState.document.updatedAtMillis)}</span>
          {isLocalDocument ? (
            <>
              <span>Saved locally</span>
              <span>{documentState.document.description}</span>
            </>
          ) : (
            <>
              <span>{documentState.document.readPermission} read</span>
              <span>{documentState.document.writePermission} write</span>
              {documentState.document.teamPath ? <span>@{documentState.document.teamPath}</span> : null}
              {documentState.document.folderPaths.length > 0 ? <span>{getFolderPathLabel(documentState.document.folderPaths)}</span> : null}
            </>
          )}
        </span>
      )}
      actions={(
        <>
          <SyncStateBadge state={documentState.syncState} />
          <ToolbarIconButton
            actionId="save-note"
            disabled={status.saving || !noteDirty}
            title={!noteDirty ? 'No unsaved note changes.' : undefined}
            onClick={() => actions.onSave(documentState.document, { title: documentState.title, content: documentState.content })}
            label="Save"
            tooltip={noteDirty ? 'Save note' : 'No unsaved note changes.'}
            className={noteDirty ? 'bg-primary-default text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground' : undefined}
          >
            {status.saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
          </ToolbarIconButton>
          <ToolbarIconButton
            actionId="toggle-inspector"
            onClick={actions.onToggleInspector}
            aria-controls={inspectorPanelId}
            aria-expanded={!layout.inspectorCollapsed}
            label={layout.inspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
            disabled={isLocalDocument}
            title={isLocalDocument ? 'Local notes do not use HackMD inspector metadata.' : undefined}
          >
            {layout.inspectorCollapsed ? <PanelRightOpen aria-hidden="true" className="h-4 w-4" /> : <PanelRightClose aria-hidden="true" className="h-4 w-4" />}
          </ToolbarIconButton>
          <DocumentActionsMenu
            actions={actions}
            documentState={documentState}
            open={actionsOpen}
            onOpenChange={onActionsOpenChange}
            onOpenShareDialog={onOpenShareDialog}
            status={status}
          />
        </>
      )}
    />
  );
}

function DocumentActionsMenu({
  actions,
  documentState,
  open,
  onOpenChange,
  onOpenShareDialog,
  status,
}: {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState & { document: DocumentSummary };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenShareDialog: () => void;
  status: DocumentDetailStatus;
}) {
  const isLocalDocument = documentState.document.teamPath === LOCAL_VAULT_TEAM_PATH;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <ToolbarDropdownMoreTrigger />
      <DropdownMenuContent align="end">
        {isLocalDocument ? null : (
          <>
            <DropdownMenuItem onSelect={() => actions.onOpenEditor(documentState.document)}>
              <Edit3 aria-hidden="true" className="h-4 w-4" />
              HackMD
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(event) => {
              event.preventDefault();
              onOpenShareDialog();
            }}>
              <Share2 aria-hidden="true" className="h-4 w-4" />
              Share
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={() => actions.onExportMarkdown(documentState.document, documentState.title, documentState.content)}>
          <Download aria-hidden="true" className="h-4 w-4" />
          Export Markdown
        </DropdownMenuItem>
        {isLocalDocument ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => actions.onCopyLink(documentState.document)}>
              <Copy aria-hidden="true" className="h-4 w-4" />
              Copy HackMD Link
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onCopyMarkdownLink(documentState.document)}>
              <Copy aria-hidden="true" className="h-4 w-4" />
              Copy Markdown Link
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive disabled={status.deleting} onSelect={() => actions.onDelete(documentState.document)}>
          {status.deleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DocumentBody({
  content,
  onContentChange,
  setEditorRef,
}: {
  content: string;
  onContentChange: (content: string) => void;
  setEditorRef: (handle: MarkdownEditorHandle | null) => void;
}) {
  return (
    <MarkdownEditor ref={setEditorRef} value={content} onChange={onContentChange} />
  );
}

function InspectorPanel({
  actions,
  content,
  document,
  editorRef,
  folderTree,
  inspectorCollapsed,
  inspectorPanelId,
  isLocalDocument,
  status,
}: {
  actions: DocumentDetailActions;
  content: string;
  document: DocumentSummary;
  editorRef: React.MutableRefObject<MarkdownEditorHandle | null>;
  folderTree: FolderTree;
  inspectorCollapsed: boolean;
  inspectorPanelId: string;
  isLocalDocument: boolean;
  status: DocumentDetailStatus;
}) {
  if (isLocalDocument) {
    return null;
  }

  return (
    <div
      id={inspectorPanelId}
      aria-hidden={inspectorCollapsed}
      className={cn(
        'shrink-0 overflow-hidden bg-background-muted transition-[border-color,background-color] duration-150 ease-out motion-reduce:transition-none',
        inspectorCollapsed ? 'border-l-0' : 'border-l border-border-default',
      )}
      style={{ width: inspectorCollapsed ? 0 : INSPECTOR_WIDTH_DEFAULT }}
    >
      {inspectorCollapsed ? null : (
        <NoteInspector
          document={document}
          folderTree={folderTree}
          status={{
            saving: status.savingMetadata,
            uploading: status.uploadingImage,
          }}
          actions={{
            onSaveMetadata: actions.onSaveMetadata,
            onUploadImage: actions.onUploadImage,
            onCopyLink: actions.onCopyLink,
            onInsertMarkdown: (markdown) => {
              if (editorRef.current) {
                editorRef.current.insertText(markdown);
                return;
              }

              actions.onContentChange(`${content}${markdown}`);
            },
          }}
        />
      )}
    </div>
  );
}
