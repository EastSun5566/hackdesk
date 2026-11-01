import { AlertCircle, Copy, Loader2, MessagesSquare, RotateCcw, Square } from 'lucide-react';
import { Fragment, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/field';
import { toast } from '@/components/ui/toast';
import { AI_PROVIDER_TITLES } from '@/lib/ai';
import { writeClipboardText } from '@/lib/clipboard';
import { getHackDeskAPI } from '@/lib/electron-api';
import type { NoteLinkTarget } from '@/lib/note-index';

import type { AskNotes, AskNotesTurn } from './useAskNotes';

/** Ask Your Notes: questions answered from the current workspace's notes, citing them. */
export function AskNotesDialog({ askNotes, onOpenNote }: {
  askNotes: AskNotes;
  /** Opens a cited note; the dialog closes so the note can be read, and the conversation stays. */
  onOpenNote: (note: NoteLinkTarget) => void;
}) {
  const [question, setQuestion] = useState('');
  const { open, setOpen, turns, busy, providers, providerId, setProviderId } = askNotes;
  const last = turns.at(-1);

  const submit = (text = question) => {
    if (!text.trim() || busy) return;
    setQuestion('');
    void askNotes.ask(text);
  };

  const openSource = (note: NoteLinkTarget) => {
    setOpen(false);
    onOpenNote(note);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="lg" className="scroll-edges gap-0 p-0">
        <DialogHeader className="scroll-edge-top relative px-5 pb-3 pt-4">
          <DialogTitle>Ask Your Notes</DialogTitle>
          <DialogDescription>
            Answers come from this workspace&apos;s notes that HackDesk has: every Local Vault note, or the HackMD notes you&apos;ve opened.
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-edges-source min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4" aria-live="polite">
          {turns.length === 0 ? (
            <p className="text-sm text-text-subtle">Ask a question, such as what a meeting decided or where a topic was discussed.</p>
          ) : turns.map(turn => (
            <TurnView
              key={turn.requestId}
              turn={turn}
              onOpenSource={openSource}
              onRetry={turn === last ? () => submit(turn.question) : undefined}
            />
          ))}
        </div>

        <form
          className="scroll-edge-bottom relative space-y-2 px-5 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Textarea
            aria-label="Question"
            placeholder="Ask about your notes…"
            rows={2}
            autoFocus
            value={question}
            onChange={event => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center gap-2">
            {providers.length > 1 && providerId ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-label={`Provider: ${AI_PROVIDER_TITLES[providerId]}. Switch provider`}
                onClick={() => setProviderId(providers[(providers.indexOf(providerId) + 1) % providers.length]!)}
              >
                {AI_PROVIDER_TITLES[providerId]} ⇄
              </Button>
            ) : (
              <span className="text-xs text-text-subtle">{providerId ? AI_PROVIDER_TITLES[providerId] : 'No provider'}</span>
            )}
            <div className="flex-1" />
            {turns.length && !busy ? (
              <Button type="button" size="sm" variant="ghost" onClick={askNotes.reset}>New conversation</Button>
            ) : null}
            {busy ? (
              <Button type="button" size="sm" onClick={askNotes.stop}>
                <Square aria-hidden="true" className="h-3.5 w-3.5" />
                Stop
              </Button>
            ) : (
              <Button type="submit" size="sm" variant="primary" disabled={!question.trim()}>
                <MessagesSquare aria-hidden="true" className="h-3.5 w-3.5" />
                Ask
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TurnView({ turn, onOpenSource, onRetry }: {
  turn: AskNotesTurn;
  onOpenSource: (note: NoteLinkTarget) => void;
  onRetry?: () => void;
}) {
  const api = getHackDeskAPI();
  const copy = () => {
    writeClipboardText(api, turn.answer).then(() => toast.success('Answer copied.'), () => toast.error('Could not copy the answer.'));
  };

  return (
    <section aria-label={turn.question} className="space-y-3">
      <p className="text-sm font-semibold text-text-default">{turn.question}</p>

      {turn.phase === 'searching' ? (
        <p role="status" className="flex items-center gap-2 text-sm text-text-subtle">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Searching your notes…
        </p>
      ) : null}
      {turn.phase === 'no-sources' ? (
        <p className="text-sm text-text-subtle">
          {`No notes match. HackDesk searched ${turn.searched} ${turn.searched === 1 ? 'note' : 'notes'} in this workspace.`}
        </p>
      ) : null}

      {turn.sources.length ? (
        <ol aria-label="Sources" className="flex flex-wrap gap-1.5">
          {turn.sources.map((source, index) => (
            <li key={source.note.noteId}>
              <Button type="button" size="xs" variant="secondary" title={source.note.title} onClick={() => onOpenSource(source.note)}>
                <span className="tabular-nums text-text-subtle">{index + 1}</span>
                <span className="max-w-56 truncate">{source.note.title || 'Untitled'}</span>
              </Button>
            </li>
          ))}
        </ol>
      ) : null}

      {turn.answer ? (
        <div className="whitespace-pre-wrap text-sm leading-6 text-text-default">
          <AnswerText answer={turn.answer} sources={turn.sources} onOpenSource={onOpenSource} />
        </div>
      ) : turn.phase === 'answering' ? (
        <p role="status" className="flex items-center gap-2 text-sm text-text-subtle">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Reading the sources…
        </p>
      ) : null}

      {turn.phase === 'stopped' ? <p className="text-xs text-text-subtle">Stopped.</p> : null}
      {turn.phase === 'error' ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive-default">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {turn.error}
        </p>
      ) : null}

      <div className="flex gap-1">
        {turn.phase === 'done' ? (
          <Button type="button" size="xs" variant="ghost" onClick={copy}>
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            Copy
          </Button>
        ) : null}
        {onRetry && (turn.phase === 'error' || turn.phase === 'stopped') ? (
          <Button type="button" size="xs" variant="ghost" onClick={onRetry}>
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            Retry
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** The answer's text, with each `[n]` that names a source turned into a link to it. */
function AnswerText({ answer, sources, onOpenSource }: {
  answer: string;
  sources: AskNotesTurn['sources'];
  onOpenSource: (note: NoteLinkTarget) => void;
}) {
  return answer.split(/(\[\d+\])/).map((part, index) => {
    const source = /^\[(\d+)\]$/.exec(part) ? sources[Number(part.slice(1, -1)) - 1] : undefined;
    if (!source) return <Fragment key={index}>{part}</Fragment>;
    return (
      <button
        key={index}
        type="button"
        className="rounded-sm px-0.5 align-baseline text-xs font-medium text-primary-default hover:bg-background-selected focus-visible:outline-2 focus-visible:outline-focus-ring"
        aria-label={`Source ${part.slice(1, -1)}: ${source.note.title || 'Untitled'}`}
        onClick={() => onOpenSource(source.note)}
      >
        {part}
      </button>
    );
  });
}
