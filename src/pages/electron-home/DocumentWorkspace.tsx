import { Fragment } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import type {
  DocumentSummary,
  NoteSummary,
  UpdateNoteInput,
  UploadNoteImageInput,
  UploadNoteImageResult,
} from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

import { DocumentDetail, type DocumentSyncState } from './DocumentDetail';
import type { NotePane, OpenNoteTab } from './note-workspace';
import { EmptyState } from './interaction-primitives';
import type { ReaderMode } from './ui-preferences';

export type DocumentPaneView = {
  pane: NotePane;
  activeTab: OpenNoteTab | null;
  selectedNote: Pick<NoteSummary, 'title'> | null;
  document?: DocumentSummary;
  title: string;
  content: string;
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
  folderTree,
  readerMode,
  shareOpen,
  isInspectorCollapsed,
  getPaneView,
  editorSearchRequestId,
  onResizePanes,
  onFocusPane,
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
}: {
  panes: NotePane[];
  activePaneId: string;
  folderTree: FolderTree;
  readerMode: ReaderMode;
  shareOpen: boolean;
  isInspectorCollapsed: boolean;
  getPaneView: (pane: NotePane) => DocumentPaneView;
  editorSearchRequestId: number;
  onResizePanes: (sizes: Record<string, number>) => void;
  onFocusPane: (paneId: string) => void;
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
  onTitleChange: (tab: OpenNoteTab, title: string) => void;
  onContentChange: (tab: OpenNoteTab, content: string) => void;
  onToggleInspector: () => void;
  onReaderModeChange: (mode: ReaderMode) => void;
  onShareOpenChange: (open: boolean) => void;
}) {
  if (panes.every((pane) => pane.tabIds.length === 0)) {
    return (
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background-default">
        <EmptyState title="Select a note." description="Choose a note from the navigator to read or edit it." />
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
                className="relative w-2 cursor-col-resize bg-background-muted outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border-default/60 hover:before:bg-primary-default focus-visible:before:bg-primary-default"
              />
            ) : null}
            <Panel
              id={pane.paneId}
              key={pane.paneId}
              minSize="24rem"
              className="min-w-0 overflow-hidden"
            >
              <section
                className={cn(
                  'flex h-full min-w-0 flex-col border-l border-border-default bg-background-default',
                  isActivePane && 'bg-background-default',
                )}
                onFocusCapture={() => onFocusPane(pane.paneId)}
              >
                <DocumentDetail
                  folderTree={folderTree}
                  documentState={{
                    selectedNote: view.selectedNote,
                    document: view.document,
                    title: view.title,
                    content: view.content,
                    syncState: view.syncState,
                  }}
                  layout={{
                    focusZone: isActivePane ? 'editor' : undefined,
                    inspectorPanelId: `note-inspector-panel-${pane.paneId}`,
                    readerMode,
                    searchRequestId: isActivePane ? editorSearchRequestId : 0,
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
                    onCopyLink,
                    onCopyMarkdownLink,
                    onExportMarkdown,
                    onSave,
                    onSaveMetadata,
                    onSaveSharing,
                    onUploadImage,
                    onDelete,
                    onTitleChange: (title) => view.activeTab && onTitleChange(view.activeTab, title),
                    onContentChange: (content) => view.activeTab && onContentChange(view.activeTab, content),
                    onToggleInspector,
                    onReaderModeChange,
                    onShareOpenChange,
                  }}
                />
              </section>
            </Panel>
          </Fragment>
        );
      })}
    </Group>
  );
}
