import { ConflictComparison } from './ConflictComparison';
import { ActionMenuShortcut } from './ActionShortcutContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { toast } from '@/components/ui/toast';
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Copy,
  Download,
  Edit3,
  FilePlus,
  FolderOpen,
  History,
  ImagePlus,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/MarkdownEditor';
import type { MarkdownEditorAi, MarkdownEditorDictation, MarkdownEditorNoteLinks } from '@/components/markdown-editor-types';
import type { LocalImageContext } from '@/lib/local-image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type {
  DocumentSummary,
  NoteComment,
  NoteSummary,
  UpdateNoteInput,
} from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import type { EditorMode } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { createImageUploadPlaceholder } from '@/components/hackmd-live-preview/markdown-image';

import { EmptyState, PanelHeader, PanelShell, ToolbarDropdownMoreTrigger, ToolbarIconButton } from './interaction-primitives';
import { LocalNoteInspector, NoteInspector } from './NoteInspector';
import { useAiInline } from './useAiInline';
import { useDictation } from './useDictation';
import { useNoteLinkOpener, type OpenNoteTarget } from './useNoteLinkOpener';
import { useNoteLinks } from './useNoteLinks';
import { NoteVersionsDialog } from './NoteVersionsDialog';
import { ShareDialog } from './ShareDialog';
import {
  formatDate,
  getFolderPathLabel,
} from './ui';
import { getLocalImageContext, LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import {
  INSPECTOR_WIDTH_DEFAULT,
} from './ui-preferences';
import { DOCUMENT_SYNC_STATE_LABELS, type DocumentSyncState } from './document-sync-state';

const NOTE_INSPECTOR_PANEL_ID = 'note-inspector-panel';

export type { DocumentSyncState } from './document-sync-state';

export type DocumentDetailDocumentState = {
  content: string;
  document?: DocumentSummary;
  isDraft: boolean;
  recovery?: {
    kind: 'disk_changed' | 'remote_changed' | 'save_failed';
    message: string;
  } | null;
  selectedNote?: Pick<NoteSummary, 'title'> | null;
  syncState: DocumentSyncState;
  title: string;
};

export type DocumentDetailLayout = {
  aiAssistRequestId?: number;
  dictateRequestId?: number;
  attachImageRequestId: number;
  onRequestHandled?: (id: number) => void;
  focusZone?: string | null;
  focusRequestId: number;
  inspectorCollapsed: boolean;
  inspectorPanelId?: string;
  searchRequestId: number;
  shareOpen: boolean;
  versionsOpen?: boolean;
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
  /** Opens a linked note in a tab, switching workspace when needed. */
  onOpenNoteTarget?: OpenNoteTarget;
  onRevealInFinder: (document: DocumentSummary) => void;
  onReadComparison?: (document: DocumentSummary, signal: AbortSignal) => Promise<{ title: string; content: string }>;
  onReloadFromDisk: (document: DocumentSummary) => void;
  onReloadFromHackmd: (document: DocumentSummary) => void;
  /** Opens the draft as a new unsaved note; the original note is left untouched. */
  onOpenAsNewDraft: (title: string, content: string) => void;
  onSave: (input: UpdateNoteInput) => void;
  onSaveAsCopy: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveSharing: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onShareOpenChange: (open: boolean) => void;
  onVersionsOpenChange?: (open: boolean) => void;
  onTitleChange: (title: string) => void;
  onToggleInspector: () => void;
  /** Uploads `file` and replaces `placeholder` in this tab's content when done. */
  onAttachImage: (file: File, placeholder: string) => Promise<unknown>;
  onCancelImageUpload?: () => void;
};

export type DocumentDetailProps = {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState;
  editorKey: string;
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
      className={cn('inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium', className)}
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
  editorKey,
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

  if (!documentState.document && !documentState.isDraft) {
    return <EmptyDocumentDetail />;
  }

  return (
    <ActiveDocumentDetail
      actions={actions}
      documentState={documentState}
      editorKey={editorKey}
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
      <div role="status" aria-busy="true" aria-label="Loading note" className="flex min-h-0 flex-1 flex-col gap-4 p-6">
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
      <EmptyState title="No note selected" description="Choose a note from the navigator to read or edit." />
    </PanelShell>
  );
}

function ActiveDocumentDetail({
  actions,
  documentState,
  editorKey,
  editorMode,
  focusZone,
  folderTree,
  layout,
  status,
}: {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState;
  editorKey: string;
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
  const lastHandledAiAssistRequestRef = useRef(0);
  const lastHandledDictateRequestRef = useRef(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const isTeamNote = Boolean(documentState.document?.teamPath) && documentState.document?.teamPath !== LOCAL_VAULT_TEAM_PATH;
  const ai = useAiInline({ noteTitle: documentState.title, isTeamNote });
  const openAiAssist = useCallback((handle: MarkdownEditorHandle) => {
    if (!handle.openAiMenu()) toast.error('Turn on Codex or Claude in Settings › AI to use AI in the editor.');
  }, []);
  const dictation = useDictation();
  const openNoteLink = useNoteLinkOpener({
    document: documentState.document,
    openNoteTarget: actions.onOpenNoteTarget,
    openExternal: actions.onOpenExternal,
  });
  const openLink = useCallback((url: string) => void openNoteLink(url), [openNoteLink]);
  const openTarget = useCallback((target: string, kind: 'url' | 'embed') => void openNoteLink(target, kind), [openNoteLink]);
  const linkableNotes = useMemo(() => folderTree.allNotes.map(entry => entry.note), [folderTree.allNotes]);
  const noteLinks = useNoteLinks({ document: documentState.document, notes: linkableNotes, openLink: openTarget });
  const hasDictation = Boolean(dictation);
  const toggleDictation = useCallback((handle: MarkdownEditorHandle) => {
    if (!hasDictation) toast.error('Dictation is available in the HackDesk desktop app on macOS 26 or later.');
    else handle.toggleDictation();
  }, [hasDictation]);
  const inspectorPanelId = layout.inspectorPanelId ?? NOTE_INSPECTOR_PANEL_ID;
  const noteDirty = documentState.isDraft
    || (documentState.document
      ? documentState.title !== documentState.document.title || documentState.content !== documentState.document.content
      : false);
  const isLocalDocument = documentState.document?.teamPath === LOCAL_VAULT_TEAM_PATH;
  const onRequestHandled = layout.onRequestHandled;
  // The editor's ref callback is the readiness signal; no delayed focus retries.
  const handleEditorRequests = useCallback((handle: MarkdownEditorHandle | null) => {
    if (!handle?.getContentDOM()) return;
    if (layout.focusRequestId > lastHandledFocusRequestRef.current) {
      lastHandledFocusRequestRef.current = layout.focusRequestId;
      onRequestHandled?.(layout.focusRequestId);
      handle.focus();
    }
    if (layout.searchRequestId > lastHandledSearchRequestRef.current) {
      lastHandledSearchRequestRef.current = layout.searchRequestId;
      onRequestHandled?.(layout.searchRequestId);
      handle.openSearch();
    }
    if (layout.attachImageRequestId > lastHandledAttachImageRequestRef.current && fileInputRef.current) {
      lastHandledAttachImageRequestRef.current = layout.attachImageRequestId;
      onRequestHandled?.(layout.attachImageRequestId);
      fileInputRef.current.click();
    }
    const aiAssistRequestId = layout.aiAssistRequestId ?? 0;
    if (aiAssistRequestId > lastHandledAiAssistRequestRef.current) {
      lastHandledAiAssistRequestRef.current = aiAssistRequestId;
      onRequestHandled?.(aiAssistRequestId);
      openAiAssist(handle);
    }
    const dictateRequestId = layout.dictateRequestId ?? 0;
    if (dictateRequestId > lastHandledDictateRequestRef.current) {
      lastHandledDictateRequestRef.current = dictateRequestId;
      onRequestHandled?.(dictateRequestId);
      toggleDictation(handle);
    }
  }, [
    layout.focusRequestId, layout.searchRequestId, layout.attachImageRequestId, layout.aiAssistRequestId, layout.dictateRequestId,
    onRequestHandled, openAiAssist, toggleDictation,
  ]);
  // Anchors point at the saved note; revealRange falls back to the excerpt when unsaved edits moved it.
  const revealComment = useCallback((comment: NoteComment) => {
    const editor = editorRef.current;
    const anchor = comment.currentAnchor ?? comment.anchor;
    if (!editor || !comment.excerpt) return false;
    return anchor
      ? editor.revealRange(anchor.offset, anchor.offset + anchor.length, comment.excerpt)
      : editor.revealText(comment.excerpt);
  }, []);
  const setEditorRef = useCallback((handle: MarkdownEditorHandle | null) => {
    editorRef.current = handle;
    handleEditorRequests(handle);
  }, [handleEditorRequests]);

  useEffect(() => {
    handleEditorRequests(editorRef.current);
  }, [handleEditorRequests]);

  const requestAttachImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const requestAiAssist = useCallback(() => {
    const editor = editorRef.current;
    // Leave the actions menu a frame to close and hand focus back before the editor opens its own.
    if (editor?.getContentDOM()) window.requestAnimationFrame(() => openAiAssist(editor));
  }, [openAiAssist]);

  const handleAttachImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      toast.error('Editor is not ready for image insertion.');
      return;
    }

    if (!documentState.document) {
      toast.error('Save the draft before attaching images.');
      return;
    }

    const placeholder = createImageUploadPlaceholder();
    editor.insertText(placeholder);
    void actions.onAttachImage(file, placeholder);
  }, [actions, documentState.document]);

  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (file) {
      handleAttachImageFile(file);
    }
  }, [handleAttachImageFile]);

  // Let the menu close and return focus before the dialog takes it.
  const openDialogFromMenu = (open: (open: boolean) => void) => {
    setActionsOpen(false);
    window.setTimeout(() => open(true), 0);
  };
  const openShareDialogFromMenu = () => openDialogFromMenu(actions.onShareOpenChange);
  const openVersionsDialogFromMenu = actions.onVersionsOpenChange
    ? () => openDialogFromMenu(actions.onVersionsOpenChange!)
    : undefined;

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
        onAiAssist={requestAiAssist}
        onOpenShareDialog={openShareDialogFromMenu}
        onOpenVersionsDialog={openVersionsDialogFromMenu}
        layout={layout}
        status={status}
      />
      <DocumentRecoveryBanner
        key={`${documentState.document?.teamPath}:${documentState.document?.id}:${getLocalImageContext(documentState.document)?.vaultId ?? ''}`}
        actions={actions}
        documentState={documentState}
      />

      <div className="flex min-h-0 flex-1">
        <DocumentBody
          key={editorKey}
          localImageContext={getLocalImageContext(documentState.document)}
          content={documentState.content}
          editorMode={editorMode}
          ai={ai}
          dictation={dictation}
          noteLinks={noteLinks}
          onAttachImage={actions.onAttachImage}
          onContentChange={actions.onContentChange}
          onOpenExternal={openLink}
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
          onRevealComment={revealComment}
          document={documentState.document}
          folderTree={folderTree}
          inspectorCollapsed={layout.inspectorCollapsed}
          inspectorPanelId={inspectorPanelId}
          isLocalDocument={isLocalDocument}
          status={status}
        />
      </div>

      {!documentState.document || isLocalDocument ? null : (
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
      {!documentState.document || isLocalDocument || !actions.onVersionsOpenChange ? null : (
        <NoteVersionsDialog
          open={!!layout.versionsOpen}
          document={documentState.document}
          noteDirty={noteDirty}
          onOpenChange={actions.onVersionsOpenChange}
          onRestore={actions.onContentChange}
          onOpenAsNewDraft={actions.onOpenAsNewDraft}
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
  documentState: DocumentDetailDocumentState;
}) {
  const [comparing, setComparing] = useState(false);
  const kind = documentState.recovery?.kind;
  if (!documentState.document || (kind !== 'disk_changed' && kind !== 'remote_changed')) {
    return null;
  }
  const document = documentState.document;
  const isRemote = kind === 'remote_changed';
  const source = isRemote ? 'HackMD' : 'disk';

  return (
    <div role="alert" className="border-b border-warning-default/30 bg-warning-soft px-4 py-2.5 text-sm text-warning-default">
      <div className="flex flex-wrap items-center gap-2">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 text-text-default">
          {isRemote ? 'This note changed on HackMD. Your draft is still open.' : 'File changed on disk. Your draft is still open.'}
        </p>
        <Button size="xs" variant="warning-outline" onClick={() => setComparing(true)}>
          Compare with {source}
        </Button>
        <Button
          size="xs"
          variant="warning-outline"
          onClick={() => (isRemote ? actions.onReloadFromHackmd(document) : actions.onReloadFromDisk(document))}
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Reload from {source}
        </Button>
        {isRemote ? (
          <Button
            size="xs"
            variant="warning"
            onClick={() => actions.onOpenAsNewDraft(documentState.title, documentState.content)}
          >
            <FilePlus aria-hidden="true" className="h-3.5 w-3.5" />
            Open as new draft
          </Button>
        ) : (
          <Button
            size="xs"
            variant="warning"
            onClick={() => actions.onSaveAsCopy(document, {
              title: documentState.title,
              content: documentState.content,
            })}
          >
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            Save as copy
          </Button>
        )}
      </div>
      {comparing ? <ConflictComparison
        key={`${document.teamPath}:${document.id}:${getLocalImageContext(document)?.vaultId ?? ''}`}
        document={document} draftTitle={documentState.title} draftContent={documentState.content}
        source={source} onClose={() => setComparing(false)} readSource={actions.onReadComparison}
      /> : null}
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
  onAiAssist,
  onAttachImage,
  onOpenShareDialog,
  onOpenVersionsDialog,
  status,
}: {
  actions: DocumentDetailActions;
  actionsOpen: boolean;
  documentState: DocumentDetailDocumentState;
  inspectorPanelId: string;
  layout: DocumentDetailLayout;
  noteDirty: boolean;
  onActionsOpenChange: (open: boolean) => void;
  onAiAssist: () => void;
  onAttachImage: () => void;
  onOpenShareDialog: () => void;
  onOpenVersionsDialog?: () => void;
  status: DocumentDetailStatus;
}) {
  const isLocalDocument = documentState.document?.teamPath === LOCAL_VAULT_TEAM_PATH;
  const effectiveSyncState = getEffectiveSyncState({
    noteDirty,
    saving: status.saving,
    syncState: documentState.syncState,
  });
  const subtitleParts = documentState.document
    ? getDocumentHeaderSubtitleParts(documentState.document, isLocalDocument)
    : ['Unsaved draft'];
  const saveTooltip = status.saving
    ? 'Saving note…'
    : documentState.isDraft
      ? 'Save draft as note'
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
            onClick={() => actions.onSave({ title: documentState.title, content: documentState.content })}
            label="Save"
            tooltip={saveTooltip}
            className={noteDirty ? 'bg-primary-default text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground' : undefined}
          >
            {status.saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" className="h-4 w-4" />}
          </ToolbarIconButton>
          {/* A vault note's details are only the notes linking to it. */}
          {!documentState.document || (isLocalDocument && !actions.onOpenNoteTarget) ? null : (
            <ToolbarIconButton
              actionId="toggle-inspector"
              onClick={actions.onToggleInspector}
              aria-controls={inspectorPanelId}
              aria-expanded={!layout.inspectorCollapsed}
              label={layout.inspectorCollapsed ? 'Expand note details' : 'Collapse note details'}
            >
              {layout.inspectorCollapsed ? <PanelRightOpen aria-hidden="true" className="h-4 w-4" /> : <PanelRightClose aria-hidden="true" className="h-4 w-4" />}
            </ToolbarIconButton>
          )}
          {documentState.document ? (
            <DocumentActionsMenu
              actions={actions}
              documentState={{ ...documentState, document: documentState.document }}
              open={actionsOpen}
              onOpenChange={onActionsOpenChange}
              onAiAssist={onAiAssist}
              onAttachImage={onAttachImage}
              onOpenShareDialog={onOpenShareDialog}
              onOpenVersionsDialog={onOpenVersionsDialog}
              status={status}
            />
          ) : null}
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
  onAiAssist,
  onAttachImage,
  onOpenShareDialog,
  onOpenVersionsDialog,
  status,
}: {
  actions: DocumentDetailActions;
  documentState: DocumentDetailDocumentState & { document: DocumentSummary };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAiAssist: () => void;
  onAttachImage: () => void;
  onOpenShareDialog: () => void;
  onOpenVersionsDialog?: () => void;
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
              <ActionMenuShortcut actionId="open-note-web-editor" />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(event) => {
              event.preventDefault();
              onOpenShareDialog();
            }}>
              <Share2 aria-hidden="true" className="h-4 w-4" />
              Share…
            </DropdownMenuItem>
            {onOpenVersionsDialog ? (
              <DropdownMenuItem onSelect={(event) => {
                event.preventDefault();
                onOpenVersionsDialog();
              }}>
                <History aria-hidden="true" className="h-4 w-4" />
                Version History…
                <ActionMenuShortcut actionId="show-note-versions" />
              </DropdownMenuItem>
            ) : null}
          </>
        )}
        {isLocalDocument ? (
          <DropdownMenuItem onSelect={() => actions.onRevealInFinder(documentState.document)}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            Reveal in Finder
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={status.uploadingImage && (isLocalDocument || !actions.onCancelImageUpload)}
          onSelect={status.uploadingImage ? actions.onCancelImageUpload : onAttachImage}
        >
          {status.uploadingImage
            ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            : <ImagePlus aria-hidden="true" className="h-4 w-4" />}
          {status.uploadingImage && !isLocalDocument && actions.onCancelImageUpload ? 'Cancel Image Upload' : 'Attach Image…'}
          {!status.uploadingImage ? <ActionMenuShortcut actionId="attach-image" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAiAssist}>
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Ask AI…
          <ActionMenuShortcut actionId="ai-assist" />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onExportMarkdown(documentState.document, documentState.title, documentState.content)}>
          <Download aria-hidden="true" className="h-4 w-4" />
          Export Markdown
          <ActionMenuShortcut actionId="export-note-markdown" />
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
          <ActionMenuShortcut actionId="delete-note" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DocumentBody({
  ai,
  dictation,
  noteLinks,
  localImageContext,
  content,
  editorMode,
  onAttachImage,
  onContentChange,
  onOpenExternal,
  setEditorRef,
}: {
  ai: MarkdownEditorAi | null;
  dictation: MarkdownEditorDictation | null;
  noteLinks: MarkdownEditorNoteLinks | null;
  localImageContext: LocalImageContext | null;
  content: string;
  editorMode: EditorMode;
  onAttachImage: (file: File, placeholder: string) => Promise<unknown>;
  onContentChange: (content: string) => void;
  onOpenExternal: (url: string) => void;
  setEditorRef: (handle: MarkdownEditorHandle | null) => void;
}) {
  return (
    <MarkdownEditor
      ref={setEditorRef}
      ai={ai}
      dictation={dictation}
      noteLinks={noteLinks}
      localImageContext={localImageContext}
      editorMode={editorMode}
      value={content}
      onAttachImage={onAttachImage}
      onChange={onContentChange}
      onOpenLink={onOpenExternal}
    />
  );
}

function InspectorPanel({
  actions,
  onRevealComment,
  document,
  folderTree,
  inspectorCollapsed,
  inspectorPanelId,
  isLocalDocument,
  status,
}: {
  actions: DocumentDetailActions;
  document?: DocumentSummary;
  folderTree: FolderTree;
  inspectorCollapsed: boolean;
  inspectorPanelId: string;
  isLocalDocument: boolean;
  onRevealComment: (comment: NoteComment) => boolean;
  status: DocumentDetailStatus;
}) {
  if (!document || (isLocalDocument && !actions.onOpenNoteTarget)) {
    return null;
  }

  return (
    <div
      id={inspectorPanelId}
      aria-hidden={inspectorCollapsed}
      className={cn(
        'min-w-0 shrink-0 bg-background-muted transition-colors duration-150 ease-out motion-reduce:transition-none',
        inspectorCollapsed ? 'w-0 border-l-0' : 'w-(--inspector-width) border-l border-border-default',
      )}
      style={{ '--inspector-width': `${INSPECTOR_WIDTH_DEFAULT}px` }}
    >
      {inspectorCollapsed ? null : isLocalDocument ? (
        <LocalNoteInspector document={document} onOpenNote={actions.onOpenNoteTarget!} />
      ) : (
        <NoteInspector
          document={document}
          folderTree={folderTree}
          status={{
            saving: status.savingMetadata,
          }}
          actions={{
            onSaveMetadata: actions.onSaveMetadata,
            onCopyLink: actions.onCopyLink,
            onShowVersions: actions.onVersionsOpenChange && (() => actions.onVersionsOpenChange?.(true)),
            // Comments live on HackMD, so they are offered where versions are.
            onRevealComment: actions.onVersionsOpenChange && onRevealComment,
            onOpenNote: actions.onOpenNoteTarget,
          }}
        />
      )}
    </div>
  );
}
