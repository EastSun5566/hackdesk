import type { EditorRequest } from './useWorkbenchEditorRequests';
import { FileText, Plus, Search } from 'lucide-react';
import { Fragment, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Group, Panel, Separator, type GroupImperativeHandle, type GroupProps } from 'react-resizable-panels';

import type {
  DocumentSummary,
  NoteSummary,
  PresentationDeck,
  UpdateNoteInput,
} from '@/lib/electron-api';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import type { FolderTree } from '@/lib/hackmd-folders';
import type { EditorMode } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentDetail, type DocumentSyncState } from './DocumentDetail';
import { getSavedTabNoteIdentity, isDraftNoteTab, isBlankNoteTab, type NotePane, type OpenNoteTab } from './note-workspace';
import { ActionMenuShortcut } from './ActionShortcutContext';
import { EmptyState } from './interaction-primitives';
import { layoutNodeId, layoutPaneIds, type PaneLayoutNode } from './pane-layout';
import { CARD_SURFACE_CLASS, GAP_SASH_CLASS, GAP_SASH_ROW_CLASS } from './ui';
import { UnavailableDocumentDetail } from './UnavailableDocumentDetail';
import { documentPaneId, documentTabId } from './document-tab-ids';
import type { OpenNoteTarget } from './useNoteLinkOpener';
import { NoteIcon } from './note-kind';
import { useNoteSummaryLookup } from './NoteSummaryCard';

function PaneGroup({ layout, id, orientation, ...props }: Omit<GroupProps, 'defaultLayout' | 'groupRef'> & { layout: Record<string, number> }) {
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  // Only changed percentages should synchronize; unrelated renders must not reset an ongoing drag.
  const layoutKey = JSON.stringify(layout);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const desired: Record<string, number> = JSON.parse(layoutKey);
    const current = group.getLayout();
    const ids = Object.keys(desired);
    // The library defers layout while a group mounts hidden or its panels are registering.
    if (ids.length !== Object.keys(current).length || ids.some(id => current[id] === undefined)) return;
    if (ids.some(id => Math.abs(current[id] - desired[id]) > 0.001)) group.setLayout(desired);
  }, [layoutKey, id, orientation]);
  return <Group {...props} id={id} orientation={orientation} defaultLayout={layout} groupRef={groupRef} />;
}

function movePaneHost(host: HTMLElement, target: HTMLElement) {
  if (host.parentElement === target) return;
  // DOM moves still relocate live selection ranges, even when moveBefore keeps focus intact.
  const selection = document.getSelection();
  const range = selection?.anchorNode && selection.focusNode
    && host.contains(selection.anchorNode) && host.contains(selection.focusNode)
    ? { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset }
    : null;
  if ('moveBefore' in target && host.isConnected && target.isConnected) {
    target.moveBefore(host, null);
  } else {
    const focused = host.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    target.appendChild(host);
    focused?.focus({ preventScroll: true });
  }
  if (range && selection) selection.setBaseAndExtent(range.anchor, range.anchorOffset, range.focus, range.focusOffset);
}

type PaneHost = {
  element: HTMLDivElement;
  scroll: Array<{ element: HTMLElement; top: number; left: number }>;
};

function BlankTabPage({
  canCreateNote,
  onCreateNote,
  onQuickOpen,
  onOpenNoteTarget,
  recentNotes,
}: {
  canCreateNote: boolean;
  onCreateNote: () => void;
  onQuickOpen: () => void;
  onOpenNoteTarget?: (note: ElectronRecentNote) => void;
  recentNotes: ElectronRecentNote[];
}) {
  const recent = onOpenNoteTarget ? recentNotes.slice(0, 8) : [];
  const lookupNoteSummary = useNoteSummaryLookup();
  // Like a browser's new-tab page: find something first, make something second, and the notes
  // you were just in below. Set high rather than centred, so the list grows downward.
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-6 pt-24">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={onQuickOpen}
          className="flex h-9 w-full items-center gap-2 rounded border border-border-default bg-background-default px-3 text-left text-sm text-text-subtle transition-colors hover:border-element-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search notes</span>
          <ActionMenuShortcut actionId="open-quick-open" />
        </button>
        {canCreateNote ? (
          <button
            type="button"
            onClick={onCreateNote}
            className="flex h-8 items-center gap-2 rounded px-3 text-sm text-text-default transition-colors hover:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Plus aria-hidden="true" className="size-4 shrink-0 text-icon-default" />
            <span className="min-w-0 flex-1 truncate text-left">New Note</span>
            <ActionMenuShortcut actionId="new-note" />
          </button>
        ) : null}
        {recent.length > 0 ? (
          <nav aria-label="Recently opened notes" className="flex flex-col gap-1 pt-3">
            <h2 className="px-3 text-xs font-medium text-text-subtle">Recently opened</h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {recent.map((note) => (
                <li key={`${note.teamPath ?? 'personal'}:${note.noteId}`}>
                  <button
                    type="button"
                    onClick={() => onOpenNoteTarget?.(note)}
                    className="flex h-8 w-full items-center gap-2 rounded px-3 text-left text-sm text-text-default transition-colors hover:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <NoteIcon note={lookupNoteSummary(note.noteId)?.note} noteId={note.noteId} className="size-3.5 text-icon-default" />
                    <span className="min-w-0 flex-1 truncate">{note.title || 'Untitled'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function PaneOutlet({ host }: { host: PaneHost }) {
  const workspace = useRef<HTMLElement | null>(null);
  const attach = useCallback((slot: HTMLDivElement | null) => {
    if (slot) {
      workspace.current = slot.closest<HTMLElement>('[data-document-workspace]');
      movePaneHost(host.element, slot);
      for (const position of host.scroll) {
        position.element.scrollTop = position.top;
        position.element.scrollLeft = position.left;
      }
      host.scroll = [];
    } else if (workspace.current?.isConnected) {
      // Park the editor before React removes its old split, keeping it connected during reparenting.
      // The temporary parent can clamp scroll offsets before the new panel acquires its size.
      host.scroll = Array.from(host.element.querySelectorAll<HTMLElement>('*'))
        .filter(element => element.scrollTop !== 0 || element.scrollLeft !== 0)
        .map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
      movePaneHost(host.element, workspace.current);
    }
  }, [host]);
  return <div ref={attach} className="flex min-h-0 min-w-0 flex-1" />;
}

export type DocumentPaneView = {
  pane: NotePane;
  activeTab: OpenNoteTab | null;
  selectedNote: Pick<NoteSummary, 'title'> & Partial<Pick<NoteSummary, 'id'>> | null;
  document?: DocumentSummary;
  isBlank: boolean;
  isDraft: boolean;
  title: string;
  content: string;
  recovery?: {
    kind: 'disk_changed' | 'remote_changed' | 'save_failed';
    message: string;
  } | null;
  /** The saved note could not be loaded; `missing` is confirmed, `read_error` may be temporary. */
  unavailable?: {
    kind: 'missing' | 'read_error';
    message: string;
    hasDraft: boolean;
    isRetrying?: boolean;
  } | null;
  isLoading: boolean;
  syncState: DocumentSyncState;
  isSaving: boolean;
  isSavingMetadata: boolean;
  isUploadingImage: boolean;
  isDeleting: boolean;
};

export function DocumentWorkspace({
  panes,
  layout,
  zoomedPaneId,
  activePaneId,
  editorMode,
  folderTree,
  shareOpen,
  versionsOpen,
  isInspectorCollapsed,
  getPaneView,
  scopeKey,
  editorRequests,
  onEditorRequestHandled,
  onResizeSplit,
  onTogglePaneZoom,
  onFocusPane,
  onOpenEditor,
  onOpenExternal,
  onOpenNoteTarget,
  onRevealFolder,
  onSaveAsTemplate,
  onPresent,
  onRevealInFinder,
  onCopyLink,
  onCopyMarkdownLink,
  onExportMarkdown,
  onReadComparison,
  onReloadFromDisk,
  onReloadFromHackmd,
  onSave,
  onSaveAsCopy,
  onSaveMetadata,
  onSaveSharing,
  onAttachImage,
  onCancelImageUpload,
  onDelete,
  onTitleChange,
  onContentChange,
  onToggleInspector,
  onShareOpenChange,
  onVersionsOpenChange,
  onCopyDraft,
  onExportDraft,
  onOpenAsNewDraft,
  onRetryLoad,
  canCreateNote,
  onCreateNote,
  onQuickOpen,
  recentNotes = [],
}: {
  panes: NotePane[];
  /** How the panes are arranged; see pane-layout. */
  layout: PaneLayoutNode;
  /** The pane filling the editor area, with the others hidden but still mounted. */
  zoomedPaneId: string | null;
  activePaneId: string;
  editorMode: EditorMode;
  folderTree: FolderTree;
  shareOpen: boolean;
  versionsOpen: boolean;
  isInspectorCollapsed: boolean;
  getPaneView: (pane: NotePane) => DocumentPaneView;
  scopeKey: string;
  editorRequests: EditorRequest[];
  onEditorRequestHandled: (id: number) => void;
  onResizeSplit: (splitId: string, sizes: Record<string, number>) => void;
  /** Zooms the active pane or restores the others; a pane's button makes it active first. */
  onTogglePaneZoom: () => void;
  onFocusPane: (paneId: string) => void;
  onOpenEditor: (document: DocumentSummary) => void;
  onOpenExternal: (url: string) => void;
  /** Opens a linked note in a tab, switching workspace when needed. */
  onOpenNoteTarget?: OpenNoteTarget;
  /** Shows a folder of the note's location in the sidebar; no IDs means the workspace root. */
  onRevealFolder?: (folderIds: string[]) => void;
  onSaveAsTemplate?: () => void;
  onPresent?: (deck: PresentationDeck) => void;
  onRevealInFinder: (document: DocumentSummary) => void;
  onCopyLink: (document: DocumentSummary) => void;
  onCopyMarkdownLink: (document: DocumentSummary) => void;
  onExportMarkdown: (document: DocumentSummary, title: string, content: string) => void;
  onReadComparison?: (document: DocumentSummary, signal: AbortSignal) => Promise<{ title: string; content: string }>;
  onReloadFromDisk: (document: DocumentSummary) => void;
  onReloadFromHackmd: (document: DocumentSummary) => void;
  onSave: (tab: OpenNoteTab, input: UpdateNoteInput, options?: { successMessage?: string }) => void;
  onSaveAsCopy: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveSharing: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onAttachImage: (tab: OpenNoteTab, file: File, placeholder: string) => Promise<unknown>;
  onCancelImageUpload?: (tab: OpenNoteTab) => void;
  onDelete: (document: DocumentSummary) => void;
  onTitleChange: (tab: OpenNoteTab, title: string) => void;
  onContentChange: (tab: OpenNoteTab, content: string) => void;
  onToggleInspector: () => void;
  onShareOpenChange: (open: boolean) => void;
  onVersionsOpenChange: (open: boolean) => void;
  onCopyDraft: (content: string) => void;
  onExportDraft: (title: string, content: string) => void;
  onOpenAsNewDraft: (title: string, content: string, paneId: string) => void;
  onRetryLoad: (tab: OpenNoteTab) => void;
  canCreateNote: boolean;
  onCreateNote: () => void;
  onQuickOpen: () => void;
  recentNotes?: ElectronRecentNote[];
}) {
  const [paneHosts] = useState(() => new Map<string, PaneHost>());
  const isEmpty = panes.every(pane => pane.tabIds.length === 0);
  useLayoutEffect(() => {
    const livePanes = new Set(isEmpty ? [] : panes.map(pane => pane.paneId));
    for (const [id, host] of paneHosts) {
      if (!livePanes.has(id)) {
        host.element.remove();
        paneHosts.delete(id);
      }
    }
  }, [isEmpty, paneHosts, panes]);
  const paneHost = (paneId: string) => {
    let host = paneHosts.get(paneId);
    if (!host) {
      const element = document.createElement('div');
      element.className = 'flex min-h-0 min-w-0 flex-1 flex-col';
      host = { element, scroll: [] };
      paneHosts.set(paneId, host);
    }
    return host;
  };
  if (isEmpty) {
    return (
      <section className={cn('flex min-w-0 flex-1 flex-col', CARD_SURFACE_CLASS)}>
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No note selected"
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              {canCreateNote ? <Button variant="primary" onClick={onCreateNote}>New Note</Button> : null}
              <Button onClick={onQuickOpen}>Search Notes</Button>
            </div>
          )}
        />
      </section>
    );
  }

  const paneOrder = layoutPaneIds(layout);

  const renderPane = (pane: NotePane) => {
    const index = paneOrder.indexOf(pane.paneId);
    const view = getPaneView(pane);
    const isActivePane = pane.paneId === activePaneId;
    const requests = isActivePane ? editorRequests.filter(request => request.scopeKey === scopeKey
      && request.paneId === pane.paneId && request.tabId === view.activeTab?.tabId
      && request.documentId === (view.activeTab && (
        getSavedTabNoteIdentity(view.activeTab)?.id
        ?? (isDraftNoteTab(view.activeTab) ? view.activeTab.draftId : isBlankNoteTab(view.activeTab) ? view.activeTab.tabId : view.activeTab.noteId)
      ))) : [];
    const requestId = (kind: EditorRequest['kind']) => requests.find(request => request.kind === kind)?.id ?? 0;

    return (
    <section
      id={documentPaneId(pane.paneId)}
      role={isActivePane ? 'tabpanel' : 'region'}
      aria-labelledby={isActivePane && view.activeTab ? documentTabId(view.activeTab.tabId) : undefined}
      data-navigation-editor-id={view.activeTab?.tabId}
      data-document-pane-id={pane.paneId}
      aria-current={isActivePane ? 'true' : undefined}
      aria-label={isActivePane ? `Active document pane ${index + 1}` : `Document pane ${index + 1}`}
      data-active-pane={isActivePane ? 'true' : 'false'}
      className={cn(
        'scroll-edges relative flex h-full min-w-0 flex-1 flex-col',
        CARD_SURFACE_CLASS,
        // Only several panes need telling apart; zoom and Hack Mode leave one.
        isActivePane && panes.length > 1 && !zoomedPaneId && 'border-primary-default/50',
      )}
      onFocusCapture={() => onFocusPane(pane.paneId)}
    >
      {view.isBlank ? (
        <BlankTabPage
          canCreateNote={canCreateNote}
          onCreateNote={onCreateNote}
          onQuickOpen={onQuickOpen}
          onOpenNoteTarget={onOpenNoteTarget}
          recentNotes={recentNotes}
        />
      ) : view.unavailable && view.activeTab && !view.document && !view.isDraft && !view.isLoading ? (
        <UnavailableDocumentDetail
          unavailable={view.unavailable}
          title={view.title}
          content={view.content}
          onCopyDraft={onCopyDraft}
          onExportDraft={onExportDraft}
          onOpenAsNewDraft={(title, content) => onOpenAsNewDraft(title, content, pane.paneId)}
          onRetry={() => view.activeTab && onRetryLoad(view.activeTab)}
        />
      ) : (
        <DocumentDetail
          // With the tab's note: a book's tab turns chapters in place, and each needs its own editor and undo history.
          editorKey={view.activeTab ? `${view.activeTab.tabId}:${isDraftNoteTab(view.activeTab) || isBlankNoteTab(view.activeTab) ? '' : `${view.activeTab.teamPath ?? ''}:${view.activeTab.noteId}`}` : `${pane.paneId}:empty`}
          editorMode={editorMode}
          folderTree={folderTree}
          documentState={{
            selectedNote: view.selectedNote,
            document: view.document,
            isDraft: view.isDraft,
            title: view.title,
            content: view.content,
            recovery: view.recovery,
            syncState: view.syncState,
          }}
          layout={{
            focusZone: 'editor',
            inspectorPanelId: `note-inspector-panel-${pane.paneId}`,
            focusRequestId: requestId('focus'),
            searchRequestId: requestId('search'),
            attachImageRequestId: requestId('attach-image'),
            renameRequestId: requestId('rename'),
            aiAssistRequestId: requestId('ai-assist'),
            dictateRequestId: requestId('dictate'),
            onRequestHandled: onEditorRequestHandled,
            shareOpen: isActivePane && shareOpen,
            versionsOpen: isActivePane && versionsOpen,
            inspectorCollapsed: !isActivePane || isInspectorCollapsed,
            paneZoom: panes.length > 1 ? { zoomed: zoomedPaneId === pane.paneId, onToggle: onTogglePaneZoom } : undefined,
          }}
          status={{
            loading: view.isLoading,
            saving: view.isSaving,
            savingMetadata: view.isSavingMetadata,
            uploadingImage: view.isUploadingImage,
            deleting: view.isDeleting,
          }}
          actions={{
            onOpenEditor,
            onOpenExternal,
            onOpenNoteTarget,
            onRevealFolder,
            onSaveAsTemplate,
            onPresent,
            onRevealInFinder,
            onCopyLink,
            onCopyMarkdownLink,
            onExportMarkdown,
            onReadComparison,
            onReloadFromDisk,
            onReloadFromHackmd,
            onOpenAsNewDraft: (title, content) => onOpenAsNewDraft(title, content, pane.paneId),
            onSave: (input, options) => view.activeTab && onSave(view.activeTab, input, options),
            onSaveAsCopy,
            onSaveMetadata,
            onSaveSharing,
            onAttachImage: (file, placeholder) => (view.activeTab ? onAttachImage(view.activeTab, file, placeholder) : Promise.resolve()),
            onCancelImageUpload: onCancelImageUpload && (() => view.activeTab && onCancelImageUpload(view.activeTab)),
            onDelete,
            onTitleChange: (title) => view.activeTab && onTitleChange(view.activeTab, title),
            onContentChange: (content) => view.activeTab && onContentChange(view.activeTab, content),
            onToggleInspector,
            onShareOpenChange,
            onVersionsOpenChange,
          }}
        />
      )}
    </section>
    );
  };

  // A split is a panel group running its way; a pane is a card. Each child is known by its id, which
  // is also how the group reports sizes back.
  const renderGroup = (node: PaneLayoutNode, children: PaneLayoutNode[], orientation: 'horizontal' | 'vertical', sizes: number[]) => (
    <PaneGroup
      id={node.type === 'split' ? node.id : 'document-workspace-panes'}
      orientation={orientation}
      className="min-h-0 min-w-0 flex-1"
      layout={Object.fromEntries(children.map((child, index) => [layoutNodeId(child), sizes[index]]))}
      onLayoutChanged={node.type === 'split' ? (sizesById) => onResizeSplit(node.id, sizesById) : undefined}
    >
      {children.map((child, index) => {
        const childId = layoutNodeId(child);
        const pane = child.type === 'pane' ? panes.find(candidate => candidate.paneId === child.paneId) : undefined;
        return (
          <Fragment key={childId}>
            {index > 0 ? (
              <Separator
                id={`document-pane-separator-${childId}`}
                aria-label={`Resize document panes ${orientation === 'horizontal' ? 'side by side' : 'stacked'}, between pane ${paneOrder.indexOf(layoutPaneIds(children[index - 1]).at(-1)!) + 1} and pane ${paneOrder.indexOf(layoutPaneIds(child)[0]) + 1}`}
                className={orientation === 'horizontal' ? GAP_SASH_CLASS : GAP_SASH_ROW_CLASS}
              />
            ) : null}
            <Panel
              id={childId}
              minSize={orientation === 'horizontal' ? '24rem' : '10rem'}
              className="flex min-h-0 min-w-0 overflow-hidden"
            >
              {child.type === 'split'
                ? renderGroup(child, child.children, child.orientation, child.sizes)
                : pane ? <PaneOutlet host={paneHost(pane.paneId)} /> : null}
            </Panel>
          </Fragment>
        );
      })}
    </PaneGroup>
  );

  return (
    // While a pane is zoomed, the others stay mounted but hidden, keeping their editors' state.
    <div data-document-workspace="" data-pane-zoomed={zoomedPaneId ? 'true' : undefined} className="flex min-h-0 min-w-0 flex-1">
      {layout.type === 'split'
        ? renderGroup(layout, layout.children, layout.orientation, layout.sizes)
        : renderGroup(layout, [layout], 'horizontal', [100])}
      {/* Editor ownership stays flat even when the resize tree gains or loses split groups. */}
      {panes.map(pane => createPortal(renderPane(pane), paneHost(pane.paneId).element, `${scopeKey}:${pane.paneId}`))}
    </div>
  );
}
