import { NOTE_MATCH_END, NOTE_MATCH_START } from '@/lib/note-index';

/** A search snippet with its matched words highlighted; the text is never parsed as HTML. */
export function NoteMatchSnippet({ snippet }: { snippet: string }) {
  const parts = snippet.split(NOTE_MATCH_START);
  return (
    <span>
      {parts[0]}
      {parts.slice(1).map((part, index) => {
        const [match, rest = ''] = part.split(NOTE_MATCH_END);
        return (
          // The order of parts is fixed for a given snippet.
          <span key={index}>
            <mark className="rounded-sm bg-primary-soft text-text-default">{match}</mark>
            {rest}
          </span>
        );
      })}
    </span>
  );
}
