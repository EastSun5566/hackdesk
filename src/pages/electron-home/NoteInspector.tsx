import { History } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Toolbar, ToolbarButton } from '@/components/ui/toolbar';
import { countWordsInText } from '@/lib/editor-status-store';
import type { DocumentSummary, NoteComment, NotePermissionRole } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { ToolbarIconButton } from './interaction-primitives';
import { BacklinksSection, useNoteBacklinks } from './NoteBacklinks';
import { CommentsSection } from './NoteComments';
import { FOCUS_RING_CLASS, formatDate } from './ui';
import { groupCommentThreads, useNoteComments } from './useNoteComments';
import type { OpenNoteTarget } from './useNoteLinkOpener';

export type NoteInspectorPanelActions = {
  onOpenNoteSettings?: () => void;
  onOpenShare?: () => void;
  /** Opens the Version History dialog; absent where versions are not offered. */
  onShowVersions?: () => void;
  /** Highlights a comment's text in the editor and reports whether it was found; absent where comments are not offered. */
  onRevealComment?: (comment: NoteComment) => boolean;
  /** Opens a note that links here; absent where notes cannot be opened from the inspector. */
  onOpenNote?: OpenNoteTarget;
};

type NoteInspectorProps = {
  actions: NoteInspectorPanelActions;
  content?: string;
  document: DocumentSummary;
};

function getReadPermissionBadge(permission: NotePermissionRole) {
  switch (permission) {
  case 'owner':
    return 'Private';
  case 'signed_in':
    return 'Signed-in read';
  case 'guest':
    return 'Public';
  }
}

export function NoteInspector(props: NoteInspectorProps) {
  return <NoteInspectorPanel key={props.document.id} {...props} />;
}

function NoteInspectorPanel({
  actions,
  content,
  document,
}: NoteInspectorProps) {
  const effectiveContent = content ?? document.content ?? '';
  const hasComments = Boolean(actions.onRevealComment);
  const backlinksState = useNoteBacklinks(document, Boolean(actions.onOpenNote));
  const hasBacklinks = Boolean(actions.onOpenNote && backlinksState.available);
  const commentsQuery = useNoteComments(document.id, hasComments);

  const openCommentCount = useMemo(
    () => (commentsQuery.data
      ? groupCommentThreads(commentsQuery.data.pages.flatMap((page) => page.comments)).open.length
      : null),
    [commentsQuery.data],
  );
  const backlinkCount = backlinksState.query.data ? backlinksState.query.data.notes.length : null;

  const [activeTab, setActiveTab] = useState<'comments' | 'backlinks'>(hasComments ? 'comments' : 'backlinks');
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const commentsSectionId = useId();
  const backlinksSectionId = useId();

  const hasToolbarActions = Boolean(
    actions.onOpenNoteSettings
    || actions.onOpenShare
    || actions.onShowVersions,
  );
  const hasSections = Boolean(hasComments || hasBacklinks);

  const selectTab = (tab: 'comments' | 'backlinks') => {
    setActiveTab(tab);
    if (tab === 'comments') {
      scrollRegionRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = globalThis.document?.getElementById(backlinksSectionId);
    target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };

  return (
    <aside
      aria-label="Note details"
      data-hackdesk-focus="inspector"
      tabIndex={-1}
      className="scroll-edges flex h-full w-full flex-col bg-background-muted outline-none"
    >
      <h2 className="sr-only">Note Details</h2>
      <header className="scroll-edge-top relative flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-border-subtle px-3 py-2.5">
        <nav aria-label="Note details sections" className="flex min-w-0 items-center gap-1">
          {hasComments ? (
            <button
              type="button"
              aria-pressed={activeTab === 'comments'}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors',
                FOCUS_RING_CLASS,
                activeTab === 'comments'
                  ? 'bg-background-selected font-medium text-text-default'
                  : 'text-text-subtle hover:bg-element-bg-hover hover:text-text-default',
              )}
              onClick={() => selectTab('comments')}
            >
              Comments{openCommentCount === null ? '' : ` (${openCommentCount})`}
            </button>
          ) : null}
          {hasBacklinks ? (
            <button
              type="button"
              aria-pressed={activeTab === 'backlinks'}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors',
                FOCUS_RING_CLASS,
                activeTab === 'backlinks'
                  ? 'bg-background-selected font-medium text-text-default'
                  : 'text-text-subtle hover:bg-element-bg-hover hover:text-text-default',
              )}
              onClick={() => selectTab('backlinks')}
            >
              Backlinks{backlinkCount === null ? '' : ` (${backlinkCount})`}
            </button>
          ) : null}
          {!hasComments && !hasBacklinks ? (
            <span className="px-1 text-xs font-medium text-text-default">Details</span>
          ) : null}
        </nav>

        {hasToolbarActions ? (
          <Toolbar aria-label="Note details actions" className="shrink-0 gap-1">
            {actions.onOpenNoteSettings ? (
              <ToolbarButton
                aria-label="Note settings"
                className={cn(
                  buttonVariants({ variant: 'secondary', size: 'xs' }),
                  'h-6 bg-background-default px-2 font-medium',
                )}
                onClick={actions.onOpenNoteSettings}
              >
                Settings
              </ToolbarButton>
            ) : null}
            {actions.onOpenShare ? (
              <ToolbarButton
                aria-label="Share note"
                className={cn(
                  buttonVariants({ variant: 'secondary', size: 'xs' }),
                  'h-6 bg-background-default px-2 font-medium',
                )}
                onClick={actions.onOpenShare}
              >
                Share
              </ToolbarButton>
            ) : null}
            {actions.onShowVersions ? (
              <ToolbarIconButton
                actionId="show-note-versions"
                onClick={actions.onShowVersions}
                label="Version history"
                className="size-6 text-text-subtle hover:text-text-default"
              >
                <History aria-hidden="true" className="size-3.5" />
              </ToolbarIconButton>
            ) : null}
          </Toolbar>
        ) : null}
      </header>

      <div
        ref={scrollRegionRef}
        data-inspector-scroll-region="true"
        className="scroll-edges-source min-h-0 flex-1 space-y-5 scroll-py-3 overflow-auto overscroll-contain px-3.5 py-3 scrollbar-gutter-stable"
      >
        {actions.onRevealComment ? (
          <CommentsSection
            id={commentsSectionId}
            noteId={document.id}
            onRevealComment={actions.onRevealComment}
          />
        ) : null}
        {actions.onOpenNote ? (
          <BacklinksSection
            id={backlinksSectionId}
            document={document}
            onOpenNote={actions.onOpenNote}
          />
        ) : null}
        {!hasSections ? (
          <p className="py-4 text-xs text-text-subtle">
            Comments and backlinks for this note appear here.
          </p>
        ) : null}
      </div>

      <NoteDataFooter
        content={effectiveContent}
        sourceLabel={getReadPermissionBadge(document.readPermission)}
        updatedAtMillis={document.updatedAtMillis}
      />
    </aside>
  );
}

/** A Local Vault note has no HackMD comments or sharing, so its sidebar shows backlinks and note data. */
export function LocalNoteInspector({
  content,
  document,
  onOpenNote,
}: {
  content?: string;
  document: DocumentSummary;
  onOpenNote: OpenNoteTarget;
}) {
  const backlinksState = useNoteBacklinks(document);
  const backlinkCount = backlinksState.query.data ? backlinksState.query.data.notes.length : null;
  const scrollRegionRef = useRef<HTMLDivElement>(null);

  return (
    <aside
      aria-label="Note details"
      data-hackdesk-focus="inspector"
      tabIndex={-1}
      className="scroll-edges flex h-full w-full flex-col bg-background-muted outline-none"
    >
      <h2 className="sr-only">Note Details</h2>
      <header className="scroll-edge-top relative flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
        <button
          type="button"
          aria-pressed="true"
          className={cn(
            'shrink-0 whitespace-nowrap rounded-md bg-background-selected px-2 py-1 text-xs font-medium text-text-default transition-colors',
            FOCUS_RING_CLASS,
          )}
          onClick={() => scrollRegionRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })}
        >
          Backlinks{backlinkCount === null ? '' : ` (${backlinkCount})`}
        </button>
      </header>
      <div
        ref={scrollRegionRef}
        data-inspector-scroll-region="true"
        className="scroll-edges-source min-h-0 flex-1 overflow-auto overscroll-contain px-3.5 py-3 scrollbar-gutter-stable"
      >
        <BacklinksSection key={document.id} document={document} onOpenNote={onOpenNote} />
      </div>
      <NoteDataFooter
        content={content ?? document.content ?? ''}
        sourceLabel="Local file"
        updatedAtMillis={document.updatedAtMillis}
      />
    </aside>
  );
}

function NoteDataFooter({
  content,
  sourceLabel,
  updatedAtMillis,
}: {
  content: string;
  sourceLabel: string;
  updatedAtMillis: number | null;
}) {
  const words = countWordsInText(content);
  const readingMinutes = Math.max(1, Math.round(words / 200));

  return (
    <footer
      data-inspector-note-data="true"
      className="scroll-edge-bottom relative flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle px-3.5 py-2.5 text-xs text-text-subtle"
    >
      <span className="shrink-0">
        {words} {words === 1 ? 'word' : 'words'} · {readingMinutes} min read
      </span>
      <span className="min-w-0 truncate text-right">
        {sourceLabel} · {formatDate(updatedAtMillis)}
      </span>
    </footer>
  );
}
