import { useMemo, type MouseEvent } from 'react';

import { renderHackmdMarkdown } from '@/lib/electron-markdown-renderer';

export function MarkdownReader({
  value,
  onOpenExternal,
}: {
  value: string;
  onOpenExternal: (url: string) => void;
}) {
  const rendered = useMemo(() => renderHackmdMarkdown(value), [value]);
  const empty = rendered.content.trim().length === 0;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    const link = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('a[href]')
      : null;

    if (!link) {
      return;
    }

    event.preventDefault();
    onOpenExternal(link.href);
  };

  if (empty) {
    return (
      <div
        data-testid="markdown-reader"
        className="markdown-reader flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-8 text-sm text-text-subtle"
      >
        Nothing to read yet.
      </div>
    );
  }

  return (
    <article
      data-testid="markdown-reader"
      className="markdown-reader min-h-0 flex-1 overflow-auto px-8 py-7"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
