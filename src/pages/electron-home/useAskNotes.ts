import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { MAX_ASK_NOTES_HISTORY, MAX_ASK_NOTES_SOURCE_CHARACTERS, getAiErrorMessage } from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';
import type { NotePassage, NoteSearchScope } from '@/lib/note-index';

import { useAiProviders } from './useAiProviders';

export type AskNotesTurn = {
  requestId: string;
  question: string;
  phase: 'searching' | 'answering' | 'done' | 'no-sources' | 'stopped' | 'error';
  /** The passages the answer may cite; `[1]` is the first. */
  sources: NotePassage[];
  answer: string;
  /** How many notes of the workspace were searched. */
  searched: number;
  error?: string;
};

/**
 * One conversation with the user's notes in the current workspace. Each question finds its own
 * passages, and earlier answers come along so a follow-up can refer to them. Moving to another
 * workspace starts over.
 */
export function useAskNotes(scope: NoteSearchScope | null) {
  const api = getHackDeskAPI();
  const { providers, providerId, setProviderId } = useAiProviders();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AskNotesTurn[]>([]);
  const turnsRef = useRef(turns);
  useLayoutEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  const activeRef = useRef<string | null>(null);

  const update = useCallback((requestId: string, patch: Partial<AskNotesTurn> | ((turn: AskNotesTurn) => Partial<AskNotesTurn>)) => {
    setTurns(current => current.map(turn => (turn.requestId === requestId
      ? { ...turn, ...(typeof patch === 'function' ? patch(turn) : patch) }
      : turn)));
  }, []);

  const stop = useCallback(() => {
    const requestId = activeRef.current;
    activeRef.current = null;
    if (!requestId) return;
    void api?.ai?.cancelTurn(requestId).catch(() => undefined);
    update(requestId, turn => (turn.phase === 'searching' || turn.phase === 'answering' ? { phase: 'stopped' } : {}));
  }, [api, update]);

  const reset = useCallback(() => {
    stop();
    setTurns([]);
  }, [stop]);

  const scopeKey = scope ? JSON.stringify(scope) : null;
  useEffect(() => reset, [reset, scopeKey]);

  const ask = useCallback(async (question: string) => {
    const findPassages = api?.noteIndex?.findPassages;
    const askNotes = api?.ai?.askNotes;
    if (!question.trim() || !scope || !findPassages || !askNotes || !providerId) return;
    stop();
    const requestId = crypto.randomUUID();
    activeRef.current = requestId;
    const isCurrent = () => activeRef.current === requestId;
    const history = turnsRef.current.filter(turn => turn.phase === 'done').slice(-MAX_ASK_NOTES_HISTORY)
      .map(turn => ({ question: turn.question, answer: turn.answer.slice(0, MAX_ASK_NOTES_SOURCE_CHARACTERS) }));
    setTurns(current => [...current, { requestId, question: question.trim(), phase: 'searching', sources: [], answer: '', searched: 0 }]);

    try {
      const { passages, indexedCount } = await findPassages({ question, scope });
      if (!isCurrent()) return;
      if (!passages.length) {
        activeRef.current = null;
        update(requestId, { phase: 'no-sources', searched: indexedCount });
        return;
      }
      update(requestId, { phase: 'answering', sources: passages, searched: indexedCount });
      const answer = await askNotes({
        requestId,
        providerId,
        question: question.trim(),
        sources: passages.map(passage => ({ title: passage.note.title, text: passage.text })),
        history,
      }, (text) => {
        if (isCurrent()) update(requestId, turn => ({ answer: turn.answer + text }));
      });
      if (!isCurrent()) return;
      activeRef.current = null;
      // The whole answer, which also covers a provider that sent it in one piece.
      update(requestId, { phase: 'done', answer });
    } catch (error) {
      if (!isCurrent()) return;
      activeRef.current = null;
      update(requestId, { phase: 'error', error: getAiErrorMessage(error) });
    }
  }, [api, providerId, scope, stop, update]);

  // Whatever is still running stops with the window.
  useEffect(() => stop, [stop]);

  return {
    open,
    setOpen,
    turns,
    ask,
    stop,
    reset,
    providers,
    providerId,
    setProviderId,
    busy: turns.some(turn => turn.phase === 'searching' || turn.phase === 'answering'),
    available: Boolean(scope && providers.length && api?.noteIndex?.findPassages && api.ai?.askNotes),
  };
}

export type AskNotes = ReturnType<typeof useAskNotes>;
