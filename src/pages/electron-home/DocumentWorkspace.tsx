import { Fragment } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import type {
  DocumentSummary,
  NoteSummary,
  UpdateNoteInput,
} from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import type { EditorMode } from '@/lib/settings';
import { cn } from '@/lib/utils';

import { DocumentDetail, type DocumentSyncState } from './DocumentDetail';
import type { NotePane, OpenNoteTab } from './note-workspace';
import { EmptyState } from './interaction-primitives';
import { UnavailableDocumentDetail } from './UnavailableDocumentDetail';
import { documentPaneId, documentTabId } from './document-tab-ids';

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
  activePaneId,
  editorMode,
  folderTree,
  shareOpen,
  isInspectorCollapsed,
  getPaneView,
  editorSearchRequestId,
  attachImageRequestId,
  editorFocusRequestId,
  onResizePanes,
  onFocusPane,
  onOpenEditor,
  onOpenExternal,
  onRevealInFinder,
  onCopyLink,
  onCopyMarkdownLink,
  onExportMarkdown,
  onReloadFromDisk,
  onReloadFromHackmd,
  onSave,
  onSaveAsCopy,
  onSaveMetadata,
  onSaveSharing,
  onAttachImage,
  onDelete,
  onTitleChange,
  onContentChange,
  onToggleInspector,
  onShareOpenChange,
  onCopyDraft,
  onExportDraft,
  onOpenAsNewDraft,
  onRetryLoad,
}: {
  panes: NotePane[];
  activePaneId: string;
  editorMode: EditorMode;
  folderTree: FolderTree;
  shareOpen: boolean;
  isInspectorCollapsed: boolean;
  getPaneView: (pane: NotePane) => DocumentPaneView;
  editorSearchRequestId: number;
  attachImageRequestId: number;
  editorFocusRequestId: number;
  onResizePanes: (sizes: Record<string, number>) => void;
  onFocusPane: (paneId: string) => void;
  onOpenEditor: (document: DocumentSummary) => void;
  onOpenExternal: (url: string) => void;
  onRevealInFinder: (document: DocumentSummary) => void;
  onCopyLink: (document: DocumentSummary) => void;
  onCopyMarkdownLink: (document: DocumentSummary) => void;
  onExportMarkdown: (document: DocumentSummary, title: string, content: string) => void;
  onReloadFromDisk: (document: DocumentSummary) => void;
  onReloadFromHackmd: (document: DocumentSummary) => void;
  onSave: (tab: OpenNoteTab, input: UpdateNoteInput) => void;
  onSaveAsCopy: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onSaveSharing: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onAttachImage: (tab: OpenNoteTab, file: File, placeholder: string) => Promise<unknown>;
  onDelete: (document: DocumentSummary) => void;
  onTitleChange: (tab: OpenNoteTab, title: string) => void;
  onContentChange: (tab: OpenNoteTab, content: string) => void;
  onToggleInspector: () => void;
  onShareOpenChange: (open: boolean) => void;
  onCopyDraft: (content: string) => void;
  onExportDraft: (title: string, content: string) => void;
  onOpenAsNewDraft: (title: string, content: string, paneId: string) => void;
  onRetryLoad: (tab: OpenNoteTab) => void;
}) {
  if (panes.every((pane) => pane.tabIds.length === 0)) {
    return (
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background-default">
        <EmptyState title="No note selected" description="Choose a note from the navigator to read or edit." />
      </section>
    );
  }

  const defaultLayout = Object.fromEntries(panes.map((pane) => [pane.paneId, pane.size]));

  return (
    <Group
      id="document-workspace-panes"
      orientation="horizontal"
      className="min-w-0 flex-1 bg-background-default"
      defaultLayout={defaultLayout}
      onLayoutChanged={onResizePanes}
    >
      {panes.map((pane, index) => {
        const view = getPaneView(pane);
        const isActivePane = pane.paneId === activePaneId;

        return (
          <Fragment key={pane.paneId}>
            {index > 0 ? (
              <Separator
                id={`document-pane-separator-${pane.paneId}`}
                aria-label={`Resize document panes between pane ${index} and pane ${index + 1}`}
                className="relative w-px cursor-col-resize bg-border-default/50 outline-none hover:bg-primary-default focus-visible:bg-primary-default"
              />
            ) : null}
            <Panel
              id={pane.paneId}
              key={pane.paneId}
              minSize="24rem"
              className="min-w-0 overflow-hidden"
            >
              <section
                id={documentPaneId(pane.paneId)}
                role={isActivePane ? 'tabpanel' : 'region'}
                aria-labelledby={isActivePane && view.activeTab ? documentTabId(view.activeTab.tabId) : undefined}
                data-document-pane-id={pane.paneId}
                aria-current={isActivePane ? 'true' : undefined}
                aria-label={isActivePane ? `Active document pane ${index + 1}` : `Document pane ${index + 1}`}
                data-active-pane={isActivePane ? 'true' : 'false'}
                className={cn(
                  'relative flex h-full min-w-0 flex-col bg-background-default before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-transparent before:content-[""]',
                  isActivePane && 'before:bg-primary-default',
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
                      focusRequestId: isActivePane ? editorFocusRequestId : 0,
                      searchRequestId: isActivePane ? editorSearchRequestId : 0,
                      attachImageRequestId: isActivePane ? attachImageRequestId : 0,
                      shareOpen: isActivePane && shareOpen,
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
                      onRevealInFinder,
                      onCopyLink,
                      onCopyMarkdownLink,
                      onExportMarkdown,
                      onReloadFromDisk,
                      onReloadFromHackmd,
                      onOpenAsNewDraft: (title, content) => onOpenAsNewDraft(title, content, pane.paneId),
                      onSave: (input) => view.activeTab && onSave(view.activeTab, input),
                      onSaveAsCopy,
                      onSaveMetadata,
                      onSaveSharing,
                      onAttachImage: (file, placeholder) => (view.activeTab ? onAttachImage(view.activeTab, file, placeholder) : Promise.resolve()),
                      onDelete,
                      onTitleChange: (title) => view.activeTab && onTitleChange(view.activeTab, title),
                      onContentChange: (content) => view.activeTab && onContentChange(view.activeTab, content),
                      onToggleInspector,
                      onShareOpenChange,
                    }}
                  />
                )}
              </section>
            </Panel>
          </Fragment>
        );
      })}
    </Group>
  );
}
