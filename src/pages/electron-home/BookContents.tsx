import { ChevronLeft, ChevronRight, ExternalLink, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import type { BookNode } from '@/lib/book';
import { cn } from '@/lib/utils';

import { PanelHeader, ToolbarIconButton } from './interaction-primitives';
import type { BookPosition, BookSession } from './useBookSession';

type OpenBookSession = BookSession & { book: NonNullable<BookSession['book']> };

/** Up and Down move between chapters, as in a list. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-book-chapter]')];
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = buttons[at + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

function BookTree({ nodes, session, current }: { nodes: BookNode[]; session: OpenBookSession; current: number | null }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node, index) => {
        if (node.kind === 'divider') {
          return <li key={`divider-${index}`} role="separator" className="mx-2 my-2 border-t border-border-default" />;
        }
        if (node.kind === 'section') {
          return (
            <li key={`section-${index}-${node.title}`} className="pt-2">
              <p className="truncate px-2 pb-1 text-xs font-semibold text-text-subtle">{node.title}</p>
              <BookTree nodes={node.children} session={session} current={current} />
            </li>
          );
        }
        return (
          <li key={`chapter-${node.index}`}>
            <button
              type="button"
              data-book-chapter=""
              aria-current={node.index === current ? 'page' : undefined}
              className={cn(
                'flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm text-text-default hover:bg-background-selected focus-visible:outline-2 focus-visible:outline-focus-ring',
                node.index === current && 'bg-background-selected font-medium',
              )}
              onClick={() => session.openChapter(node.index)}
            >
              <span className="truncate">{node.title}</span>
              {node.newTab ? <ExternalLink aria-label="Opens in browser" className="size-3 shrink-0 text-text-subtle" /> : null}
            </button>
            {node.children.length ? (
              <div className="pl-3">
                <BookTree nodes={node.children} session={session} current={current} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The open book's table of contents, beside the book or one of its chapters. */
export function BookContents({ session, position }: { session: OpenBookSession; position: BookPosition }) {
  if (session.contentsHidden) {
    return (
      <div className="shrink-0 border-r border-border-default bg-background-muted p-1.5">
        <ToolbarIconButton label="Show book contents" actionId="toggle-book-contents" onClick={session.toggleContents}>
          <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
        </ToolbarIconButton>
      </div>
    );
  }

  // The header shows its line only while the contents scroll under it.
  return (
    <nav aria-label="Book contents" className="scroll-edges flex w-64 shrink-0 flex-col border-r border-border-default bg-background-muted">
      <PanelHeader
        title={session.book.title}
        subtitle="Book"
        className="scroll-edge-top relative px-3 py-2.5"
        actionsLabel="Book actions"
        actions={(
          <>
            <ToolbarIconButton label="Hide book contents" actionId="toggle-book-contents" onClick={session.toggleContents}>
              <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
            </ToolbarIconButton>
            <ToolbarIconButton label="Close book" actionId="close-book" onClick={session.close}>
              <X aria-hidden="true" className="h-4 w-4" />
            </ToolbarIconButton>
          </>
        )}
      />
      <div className="scroll-edges-source min-h-0 flex-1 overflow-auto overscroll-contain px-2 py-2" onKeyDown={moveFocus}>
        {session.book.contents.chapters.length ? (
          <BookTree nodes={session.book.contents.nodes} session={session} current={position.chapterIndex} />
        ) : (
          <p className="px-2 text-xs text-text-subtle">Add bulleted links to notes to make chapters.</p>
        )}
      </div>
    </nav>
  );
}

/** Previous and next chapter, under a chapter; from the book itself, next is the first chapter. */
export function ChapterNav({ session, position }: { session: OpenBookSession; position: BookPosition }) {
  const { chapters } = session.book.contents;
  const at = position.chapterIndex ?? -1;
  const previous = at > 0 ? chapters[at - 1] : undefined;
  const next = chapters[at + 1];
  if (!previous && !next) return null;

  return (
    <nav aria-label="Chapters" className="flex shrink-0 items-center justify-between gap-3 border-t border-border-default px-4 py-2">
      {previous ? (
        <Button size="sm" variant="ghost" className="min-w-0" aria-label={`Previous chapter: ${previous.title}`} onClick={() => session.openChapter(previous.index)}>
          <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{previous.title}</span>
        </Button>
      ) : <span />}
      {next ? (
        <Button size="sm" variant="ghost" className="min-w-0" aria-label={`Next chapter: ${next.title}`} onClick={() => session.openChapter(next.index)}>
          <span className="truncate">{next.title}</span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      ) : null}
    </nav>
  );
}
