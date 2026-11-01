import type { EditorRequest } from './useWorkbenchEditorRequests';
import { FileText } from 'lucide-react';
import { Fragment } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import type {
  DocumentSummary,
  NoteSummary,
  PresentationDeck,
  UpdateNoteInput,
} from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import type { EditorMode } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentDetail, type DocumentSyncState } from './DocumentDetail';
import type { NotePane, OpenNoteTab } from './note-workspace';
import { EmptyState } from './interaction-primitives';
import { layoutNodeId, layoutPaneIds, type PaneLayoutNode } from './pane-layout';
import { CARD_SURFACE_CLASS, GAP_SASH_CLASS, GAP_SASH_ROW_CLASS } from './ui';
import { UnavailableDocumentDetail } from './UnavailableDocumentDetail';
import { documentPaneId, documentTabId } from './document-tab-ids';
import type { OpenNoteTarget } from './useNoteLinkOpener';

export type DocumentPaneView = {
  pane: NotePane;
  activeTab: OpenNoteTab | null;
  selectedNote: Pick<NoteSummary, 'title'> | null;
  document?: DocumentSummary;
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
  onSave: (tab: OpenNoteTab, input: UpdateNoteInput) => void;
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
}) {
  if (panes.every((pane) => pane.tabIds.length === 0)) {
    return (
      <section className={cn('flex min-w-0 flex-1 flex-col', CARD_SURFACE_CLASS)}>
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No note selected"
          description="Choose a note from the navigator to read or edit."
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
      && request.documentId === (view.activeTab && ('noteId' in view.activeTab ? view.activeTab.noteId : view.activeTab.draftId))) : [];
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
      {view.unavailable && view.activeTab && !view.document && !view.isDraft && !view.isLoading ? (
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
          editorKey={view.activeTab?.tabId ?? `${pane.paneId}:empty`}
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
            onSave: (input) => view.activeTab && onSave(view.activeTab, input),
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
    <Group
      id={node.type === 'split' ? node.id : 'document-workspace-panes'}
      orientation={orientation}
      className="min-h-0 min-w-0 flex-1"
      defaultLayout={Object.fromEntries(children.map((child, index) => [layoutNodeId(child), sizes[index]]))}
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
                aria-label={`Resize document panes ${orientation === 'horizontal' ? 'side by side' : 'stacked'}`}
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
                : pane ? renderPane(pane) : null}
            </Panel>
          </Fragment>
        );
      })}
    </Group>
  );

  return (
    // While a pane is zoomed, the others stay mounted but hidden, keeping their editors' state.
    <div data-pane-zoomed={zoomedPaneId ? 'true' : undefined} className="flex min-h-0 min-w-0 flex-1">
      {layout.type === 'split'
        ? renderGroup(layout, layout.children, layout.orientation, layout.sizes)
        : renderGroup(layout, [layout], 'horizontal', [100])}
    </div>
  );
}
