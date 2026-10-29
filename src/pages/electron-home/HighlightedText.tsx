import { findMatchRanges } from '@/lib/match-highlight';

/** Text with the parts a search query matched in bold accent color; the text is never parsed as HTML. */
export function HighlightedText({ text, query, acronym = true }: { text: string; query: string; acronym?: boolean }) {
  const ranges = findMatchRanges(text, query, { acronym });
  if (!ranges.length) return text;

  const parts = [];
  let position = 0;
  for (const [start, end] of ranges) {
    if (start > position) parts.push(text.slice(position, start));
    parts.push(<mark key={start} className="bg-transparent font-semibold text-command-item-match">{text.slice(start, end)}</mark>);
    position = end;
  }
  if (position < text.length) parts.push(text.slice(position));
  return <>{parts}</>;
}
