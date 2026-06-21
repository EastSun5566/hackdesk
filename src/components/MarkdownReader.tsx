import { useEffect, useMemo, useRef } from 'react';

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
  const readerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const reader = readerRef.current;

    if (!reader || empty) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      const link = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[href]')
        : null;

      if (!link || !reader.contains(link)) {
        return;
      }

      event.preventDefault();
      onOpenExternal(link.href);
    };

    reader.addEventListener('click', handleClick);

    return () => {
      reader.removeEventListener('click', handleClick);
    };
  }, [empty, onOpenExternal]);

  if (empty) {
    return (
      <div
        data-testid="markdown-reader"
        className="markdown-reader flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-6 text-sm text-text-subtle"
      >
        Nothing to read yet.
      </div>
    );
  }

  return (
    <article
      ref={readerRef}
      data-testid="markdown-reader"
      className="markdown-reader min-h-0 flex-1 overflow-auto px-6 py-4"
      dangerouslySetInnerHTML={{ __html: rendered.sanitizedHtml }}
    />
  );
}
