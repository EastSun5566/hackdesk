import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { toast } from '@/components/ui/toast';
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Copy,
  Download,
  Edit3,
  FolderOpen,
  ImagePlus,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
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
import type { EditorMode } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { formatMarkdownImage } from '@/components/hackmd-live-preview/markdown-image';

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
import { DOCUMENT_SYNC_STATE_LABELS, type DocumentSyncState } from './document-sync-state';

const NOTE_INSPECTOR_PANEL_ID = 'note-inspector-panel';

export type { DocumentSyncState } from './document-sync-state';

export type DocumentDetailDocumentState = {
  content: string;
  document?: DocumentSummary;
  recovery?: {
    kind: 'disk_changed';
    message: string;
  } | null;
  selectedNote?: Pick<NoteSummary, 'title'> | null;
  syncState: DocumentSyncState;
  title: string;
};

export type DocumentDetailLayout = {
  attachImageRequestId: number;
  focusZone?: string | null;
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
  onRevealInFinder: (document: DocumentSummary) => void;
  onReloadFromDisk: (document: DocumentSummary) => void;
  onSave: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveAsCopy: (document: DocumentSummary, input: UpdateNoteInput) => void;
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
  editorMode: EditorMode;
  folderTree: FolderTree;
  layout: DocumentDetailLayout;
  status: DocumentDetailStatus;
};

function getEffectiveSyncState({
  noteDirty,
  saving,
  syncState,
}: {
  noteDirty: boolean;
  saving: boolean;
  syncState: DocumentSyncState;
}): DocumentSyncState {
  if (saving) {
    return 'saving';
  }

  if (syncState === 'save_failed' || syncState === 'conflict') {
    return syncState;
  }

  if (noteDirty) {
    return 'idle';
  }

  return syncState;
}

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
    ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
    : state === 'cached'
      ? <CloudOff aria-hidden="true" className="h-3 w-3" />
      : state === 'save_failed' || state === 'conflict'
        ? <AlertCircle aria-hidden="true" className="h-3 w-3" />
        : <CheckCircle2 aria-hidden="true" className="h-3 w-3" />;

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn('inline-flex h-7 shrink-0 items-center gap-1 rounded-[6px] border px-2 text-xs font-medium', className)}
      aria-label={`Sync state: ${DOCUMENT_SYNC_STATE_LABELS[state]}`}
    >
      {icon}
      {DOCUMENT_SYNC_STATE_LABELS[state]}
    </span>
  );
}

function getDocumentHeaderSubtitleParts(document: DocumentSummary, isLocalDocument: boolean) {
  const parts = [formatDate(document.updatedAtMillis)];

  if (isLocalDocument) {
    if (document.description) {
      parts.push(document.description);
    }
    return parts;
  }

  parts.push(document.teamPath ? `@${document.teamPath}` : 'My Workspace');

  const folderPath = getFolderPathLabel(document.folderPaths);
  if (folderPath) {
    parts.push(folderPath);
  }

  return parts;
}

export function DocumentDetail({
  actions,
  documentState,
  editorMode,
  folderTree,
  layout,
  status,
}: DocumentDetailProps) {
  const focusZone = layout.focusZone === undefined ? 'editor' : layout.focusZone ?? undefined;

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
      editorMode={editorMode}
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
  focusZone?: string;
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
  editorMode,
  focusZone,
  folderTree,
  layout,
  status,
}: {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState & { document: DocumentSummary };
  editorMode: EditorMode;
  focusZone?: string;
  folderTree: FolderTree;
  layout: DocumentDetailLayout;
  status: DocumentDetailStatus;
}) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastHandledAttachImageRequestRef = useRef(0);
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

  const requestAttachImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
    if (layout.attachImageRequestId <= lastHandledAttachImageRequestRef.current) {
      return;
    }

    lastHandledAttachImageRequestRef.current = layout.attachImageRequestId;
    requestAttachImage();
  }, [layout.attachImageRequestId, requestAttachImage]);

  const handleAttachImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      toast.error('Editor is not ready for image insertion.');
      return;
    }

    void uploadImageFile(actions.onUploadImage, documentState.document, file)
      .then((result) => {
        editor.insertText(formatMarkdownImage(file.name || 'image', result.link));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to insert image.');
      });
  }, [actions.onUploadImage, documentState.document]);

  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (file) {
      handleAttachImageFile(file);
    }
  }, [handleAttachImageFile]);

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
        onAttachImage={requestAttachImage}
        onOpenShareDialog={openShareDialogFromMenu}
        layout={layout}
        status={status}
      />
      <DocumentRecoveryBanner
        actions={actions}
        documentState={documentState}
      />

      <div className="flex min-h-0 flex-1">
        <DocumentBody
          content={documentState.content}
          document={documentState.document}
          editorMode={editorMode}
          onAttachImage={actions.onUploadImage}
          onContentChange={actions.onContentChange}
          setEditorRef={setEditorRef}
        />
        <input
          ref={fileInputRef}
          aria-label="Attach image"
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={handleFileInputChange}
        />
        <InspectorPanel
          actions={actions}
          document={documentState.document}
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

function DocumentRecoveryBanner({
  actions,
  documentState,
}: {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState & { document: DocumentSummary };
}) {
  if (documentState.recovery?.kind !== 'disk_changed') {
    return null;
  }

  return (
    <div className="border-b border-warning-default/30 bg-warning-soft px-4 py-2.5 text-sm text-warning-default">
      <div className="flex flex-wrap items-center gap-2">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 text-text-default">
          File changed on disk. Your draft is still open.
        </p>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-warning-default/35 bg-background-default px-2 text-xs font-medium text-text-default hover:bg-background-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={() => actions.onReloadFromDisk(documentState.document)}
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Reload from disk
        </button>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-[6px] bg-warning-default px-2 text-xs font-medium text-background-default hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={() => actions.onSaveAsCopy(documentState.document, {
            title: documentState.title,
            content: documentState.content,
          })}
        >
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          Save as copy
        </button>
      </div>
    </div>
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
  onAttachImage,
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
  onAttachImage: () => void;
  onOpenShareDialog: () => void;
  status: DocumentDetailStatus;
}) {
  const isLocalDocument = documentState.document.teamPath === LOCAL_VAULT_TEAM_PATH;
  const effectiveSyncState = getEffectiveSyncState({
    noteDirty,
    saving: status.saving,
    syncState: documentState.syncState,
  });
  const subtitleParts = getDocumentHeaderSubtitleParts(documentState.document, isLocalDocument);
  const saveTooltip = status.saving
    ? 'Saving note…'
    : noteDirty
      ? 'Save note'
      : 'No unsaved note changes.';

  return (
    <PanelHeader
      className="px-4 py-2.5"
      titleElement="div"
      actionsLabel="Document actions"
      title={(
        <label className="-mx-1.5 block min-w-0">
          <span className="sr-only">Note title</span>
          <input
            name="title"
            value={documentState.title}
            onChange={(event) => actions.onTitleChange(event.target.value)}
            className="w-full min-w-0 truncate rounded-md bg-transparent px-1.5 py-0.5 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </label>
      )}
      subtitle={(
        <span className="flex flex-wrap items-center gap-2">
          {subtitleParts.map((part, index) => (
            <span key={`${part}:${index}`} className={index === 0 ? 'tabular-nums' : undefined}>{part}</span>
          ))}
        </span>
      )}
      actions={(
        <>
          <SyncStateBadge state={effectiveSyncState} />
          <ToolbarIconButton
            actionId="save-note"
            disabled={status.saving || !noteDirty}
            title={!noteDirty ? 'No unsaved note changes.' : undefined}
            onClick={() => actions.onSave(documentState.document, { title: documentState.title, content: documentState.content })}
            label="Save"
            tooltip={saveTooltip}
            className={noteDirty ? 'bg-primary-default text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground' : undefined}
          >
            {status.saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" className="h-4 w-4" />}
          </ToolbarIconButton>
          {isLocalDocument ? null : (
            <ToolbarIconButton
              actionId="toggle-inspector"
              onClick={actions.onToggleInspector}
              aria-controls={inspectorPanelId}
              aria-expanded={!layout.inspectorCollapsed}
              label={layout.inspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
            >
              {layout.inspectorCollapsed ? <PanelRightOpen aria-hidden="true" className="h-4 w-4" /> : <PanelRightClose aria-hidden="true" className="h-4 w-4" />}
            </ToolbarIconButton>
          )}
          <DocumentActionsMenu
            actions={actions}
            documentState={documentState}
            open={actionsOpen}
            onOpenChange={onActionsOpenChange}
            onAttachImage={onAttachImage}
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
  onAttachImage,
  onOpenShareDialog,
  status,
}: {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState & { document: DocumentSummary };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttachImage: () => void;
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
              Open in HackMD
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(event) => {
              event.preventDefault();
              onOpenShareDialog();
            }}>
              <Share2 aria-hidden="true" className="h-4 w-4" />
              Share…
            </DropdownMenuItem>
          </>
        )}
        {isLocalDocument ? (
          <DropdownMenuItem onSelect={() => actions.onRevealInFinder(documentState.document)}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            Reveal in Finder
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={status.uploadingImage} onSelect={onAttachImage}>
          {status.uploadingImage
            ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            : <ImagePlus aria-hidden="true" className="h-4 w-4" />}
          Attach Image…
        </DropdownMenuItem>
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
          {status.deleting
            ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            : <Trash2 aria-hidden="true" className="h-4 w-4" />}
          {isLocalDocument ? 'Move to Trash' : 'Delete'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DocumentBody({
  content,
  document,
  editorMode,
  onAttachImage,
  onContentChange,
  setEditorRef,
}: {
  content: string;
  document: DocumentSummary;
  editorMode: EditorMode;
  onAttachImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
  onContentChange: (content: string) => void;
  setEditorRef: (handle: MarkdownEditorHandle | null) => void;
}) {
  const handleAttachImage = useCallback(async (file: File) => {
    try {
      return await uploadImageFile(onAttachImage, document, file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to insert image.');
      throw error;
    }
  }, [document, onAttachImage]);

  return (
    <MarkdownEditor
      ref={setEditorRef}
      editorMode={editorMode}
      value={content}
      onAttachImage={handleAttachImage}
      onChange={onContentChange}
    />
  );
}

async function uploadImageFile(
  onAttachImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>,
  document: DocumentSummary,
  file: File,
) {
  const bytes = await file.arrayBuffer();

  return await onAttachImage(document, {
    bytes,
    fileName: file.name || 'image',
    mimeType: file.type || 'application/octet-stream',
  });
}

function InspectorPanel({
  actions,
  document,
  folderTree,
  inspectorCollapsed,
  inspectorPanelId,
  isLocalDocument,
  status,
}: {
  actions: DocumentDetailActions;
  document: DocumentSummary;
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
          }}
          actions={{
            onSaveMetadata: actions.onSaveMetadata,
            onCopyLink: actions.onCopyLink,
          }}
        />
      )}
    </div>
  );
}
