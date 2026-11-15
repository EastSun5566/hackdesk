import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import type { DocumentSummary, PresentationDeck, UpdateNoteInput } from '@/lib/electron-api';
import { useStableCallbackObject } from '@/lib/stable-props';

import type { DocumentDetailActions } from './DocumentDetail';
import type { OpenNoteTab } from './note-workspace';
import type { OpenNoteTarget } from './useNoteLinkOpener';
import { useOverlayControls } from './WorkbenchOverlaysContext';

/**
 * What the workbench does to a note on behalf of a pane: save, delete, copy its link, upload an
 * image, reload it. The ones that act on a tab take it, since every pane shares them.
 */
export type WorkbenchDocumentActions = {
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
  onCopyDraft: (content: string) => void;
  onExportDraft: (title: string, content: string) => void;
  onOpenAsNewDraft: (title: string, content: string, paneId: string) => void;
  onRetryLoad: (tab: OpenNoteTab) => void;
};

const WorkbenchDocumentActionsContext = createContext<WorkbenchDocumentActions | null>(null);
const DocumentActionsContext = createContext<DocumentDetailActions | null>(null);

/**
 * The workbench rebuilds `value` on every render (each keystroke in the editor); the context holds
 * stable wrappers instead, so it changes only when an optional action comes or goes.
 */
export function WorkbenchDocumentActionsProvider({ value, children }: { value: WorkbenchDocumentActions; children: ReactNode }) {
  const actions = useStableCallbackObject(value);
  return <WorkbenchDocumentActionsContext.Provider value={actions}>{children}</WorkbenchDocumentActionsContext.Provider>;
}

export function useWorkbenchDocumentActions(): WorkbenchDocumentActions {
  const actions = useContext(WorkbenchDocumentActionsContext);
  if (!actions) throw new Error('Document actions are read inside WorkbenchDocumentActionsProvider.');
  return actions;
}

/** Provides one pane's actions as they are; tests use it to give a document view its actions. */
export function DocumentActionsProvider({ value, children }: { value: DocumentDetailActions; children: ReactNode }) {
  return <DocumentActionsContext.Provider value={value}>{children}</DocumentActionsContext.Provider>;
}

/**
 * The workbench's actions bound to the tab a pane shows, so the document view and its header, menu
 * and inspector act on that tab without being handed it.
 */
export function PaneDocumentActions({ tab, paneId, children }: { tab: OpenNoteTab | null; paneId: string; children: ReactNode }) {
  const workbench = useWorkbenchDocumentActions();
  // Share and Versions open over the active pane; the workbench overlays hold whether they are open.
  const overlayControls = useOverlayControls();
  const onShareOpenChange = useCallback((open: boolean) => overlayControls.set('share', open), [overlayControls]);
  const onVersionsOpenChange = useCallback((open: boolean) => overlayControls.set('versions', open), [overlayControls]);
  const actions = useMemo<DocumentDetailActions>(() => {
    const { onSave, onAttachImage, onCancelImageUpload, onTitleChange, onContentChange, onOpenAsNewDraft } = workbench;
    return {
      onOpenEditor: workbench.onOpenEditor,
      onOpenExternal: workbench.onOpenExternal,
      onOpenNoteTarget: workbench.onOpenNoteTarget,
      onRevealFolder: workbench.onRevealFolder,
      onSaveAsTemplate: workbench.onSaveAsTemplate,
      onPresent: workbench.onPresent,
      onRevealInFinder: workbench.onRevealInFinder,
      onCopyLink: workbench.onCopyLink,
      onCopyMarkdownLink: workbench.onCopyMarkdownLink,
      onExportMarkdown: workbench.onExportMarkdown,
      onReadComparison: workbench.onReadComparison,
      onReloadFromDisk: workbench.onReloadFromDisk,
      onReloadFromHackmd: workbench.onReloadFromHackmd,
      onSaveAsCopy: workbench.onSaveAsCopy,
      onSaveMetadata: workbench.onSaveMetadata,
      onSaveSharing: workbench.onSaveSharing,
      onDelete: workbench.onDelete,
      onToggleInspector: workbench.onToggleInspector,
      onOpenAsNewDraft: (title, content) => onOpenAsNewDraft(title, content, paneId),
      onSave: (input, options) => {
        if (tab) onSave(tab, input, options);
      },
      onAttachImage: (file, placeholder) => (tab ? onAttachImage(tab, file, placeholder) : Promise.resolve()),
      onCancelImageUpload: onCancelImageUpload && (() => {
        if (tab) onCancelImageUpload(tab);
      }),
      onTitleChange: (title) => {
        if (tab) onTitleChange(tab, title);
      },
      onContentChange: (content) => {
        if (tab) onContentChange(tab, content);
      },
      onShareOpenChange,
      onVersionsOpenChange,
    };
  }, [workbench, tab, paneId, onShareOpenChange, onVersionsOpenChange]);
  return <DocumentActionsContext.Provider value={actions}>{children}</DocumentActionsContext.Provider>;
}

/** The actions of the pane this document view is in. */
export function useDocumentActions(): DocumentDetailActions {
  const actions = useContext(DocumentActionsContext);
  if (!actions) throw new Error('Document actions are read inside a pane (PaneDocumentActions).');
  return actions;
}

