import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';

import type { MarkdownEditorAi } from '@/components/markdown-editor-types';
import {
  appendAiInlineOutput,
  failAiInlineRun,
  finishAiInlineRun,
  getAiInlineState,
  startAiInlineRun,
  type AiInlineState,
} from '@/components/hackmd-live-preview/ai-inline/state';
import {
  AI_ACTION_DETAILS,
  MAX_AI_CONTEXT_CHARACTERS,
  MAX_AI_INPUT_CHARACTERS,
  getAiErrorMessage,
  type AiAction,
  type AiProviderId,
} from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';

import { AiInlinePanel } from './AiInlinePanel';

export type AiInlineRun = { action: AiAction; instruction?: string };

type ActiveRequest = { requestId: string; session: number };

export type AiInlineController = {
  providers: AiProviderId[];
  providerId: AiProviderId | null;
  setProviderId: (id: AiProviderId) => void;
  translateLanguage: string;
  isTeamNote: boolean;
  run: (view: EditorView, request: AiInlineRun) => void;
  retry: (view: EditorView) => void;
  lastRun: AiInlineRun | null;
};

function isLive(view: EditorView) {
  return view.dom.isConnected;
}

/** Owns inline AI for one note: which providers are on, the running request, and its cancellation. */
export function useAiInline({ noteTitle, isTeamNote }: { noteTitle: string; isTeamNote: boolean }): MarkdownEditorAi | null {
  const api = getHackDeskAPI();
  const [config, setConfig] = useState<{ providers: AiProviderId[]; selectionChip: boolean; translateLanguage: string }>({
    providers: [],
    selectionChip: true,
    translateLanguage: 'English',
  });
  const { providers, selectionChip, translateLanguage } = config;
  const [providerId, setProviderId] = useState<AiProviderId | null>(null);
  const [lastRun, setLastRun] = useState<AiInlineRun | null>(null);
  const activeRef = useRef<ActiveRequest | null>(null);
  const noteTitleRef = useRef(noteTitle);
  useLayoutEffect(() => {
    noteTitleRef.current = noteTitle;
  }, [noteTitle]);

  // Read once per note; Settings changes apply to the next note opened or the next menu after a reload.
  useEffect(() => {
    if (!api?.ai) return undefined;
    let cancelled = false;
    void Promise.all([api.ai.listProviders(), api.settings.get()]).then(([statuses, settings]) => {
      if (cancelled) return;
      const enabled = statuses.filter(status => status.enabled).map(status => status.id);
      const preferred = settings.ai?.defaultProvider;
      setConfig({
        providers: enabled,
        selectionChip: settings.ai?.selectionChip ?? true,
        translateLanguage: settings.ai?.translateLanguage ?? 'English',
      });
      setProviderId(preferred && enabled.includes(preferred) ? preferred : enabled[0] ?? null);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const cancelActive = useCallback(() => {
    const active = activeRef.current;
    activeRef.current = null;
    if (active) void api?.ai?.cancelTurn(active.requestId).catch(() => undefined);
  }, [api]);

  // A note closed mid-answer stops its CLI.
  useEffect(() => cancelActive, [cancelActive]);

  const run = useCallback((view: EditorView, request: AiInlineRun) => {
    const session = getAiInlineState(view.state);
    if (!api?.ai || !providerId || session.phase === 'idle') return;
    if (!session.original.trim()) return;
    if (session.original.length > MAX_AI_INPUT_CHARACTERS) {
      view.dispatch({ effects: [startAiInlineRun.of({ delivery: AI_ACTION_DETAILS[request.action].delivery })] });
      view.dispatch({ effects: failAiInlineRun.of({ session: session.session, message: 'This text is too long for AI. Select a shorter part of the note.' }) });
      return;
    }
    cancelActive();
    setLastRun(request);
    const requestId = crypto.randomUUID();
    activeRef.current = { requestId, session: session.session };
    const isCurrent = () => activeRef.current?.requestId === requestId && isLive(view);
    view.dispatch({ effects: startAiInlineRun.of({ delivery: AI_ACTION_DETAILS[request.action].delivery }) });
    // Enter accepts and Escape discards from the editor, so it keeps the keyboard while the answer streams.
    view.focus();
    const { doc } = view.state;
    void api.ai.runTurn({
      requestId,
      providerId,
      action: request.action,
      text: session.original,
      noteTitle: noteTitleRef.current || undefined,
      ...(request.action === 'translate' ? { targetLanguage: translateLanguage } : {}),
      ...(request.instruction ? { instruction: request.instruction } : {}),
      context: {
        before: doc.sliceString(Math.max(0, session.from - MAX_AI_CONTEXT_CHARACTERS), session.from),
        after: doc.sliceString(session.to, Math.min(doc.length, session.to + MAX_AI_CONTEXT_CHARACTERS)),
      },
    }, (text) => {
      if (isCurrent()) view.dispatch({ effects: appendAiInlineOutput.of({ session: session.session, text }) });
    }).then((output) => {
      if (!isCurrent()) return;
      activeRef.current = null;
      view.dispatch({ effects: finishAiInlineRun.of({ session: session.session, output }) });
    }, (error: unknown) => {
      if (!isCurrent()) return;
      activeRef.current = null;
      view.dispatch({ effects: failAiInlineRun.of({ session: session.session, message: getAiErrorMessage(error) }) });
    });
  }, [api, cancelActive, providerId, translateLanguage]);

  const retry = useCallback((view: EditorView) => {
    if (lastRun) run(view, lastRun);
  }, [lastRun, run]);

  const onSessionChange = useCallback((session: AiInlineState, view: EditorView) => {
    const active = activeRef.current;
    // Discarded, edited under, or replaced by a new session: the old answer is no longer wanted.
    if (active && (session.phase === 'idle' || session.session !== active.session)) cancelActive();
    if (session.phase === 'idle' && view.hasFocus === false && isLive(view)) view.focus();
    if (session.phase === 'menu' && providerId) void api?.ai?.prewarm?.(providerId).catch(() => undefined);
  }, [api, cancelActive, providerId]);

  const controller = useMemo<AiInlineController>(() => ({
    providers,
    providerId,
    setProviderId,
    translateLanguage,
    isTeamNote,
    run,
    retry,
    lastRun,
  }), [isTeamNote, lastRun, providerId, providers, retry, run, translateLanguage]);

  return useMemo<MarkdownEditorAi | null>(() => (api?.ai ? {
    available: providers.length > 0,
    selectionChip,
    onSessionChange,
    renderPanel: ({ view, session }) => <AiInlinePanel view={view} session={session} controller={controller} />,
  } : null), [api, controller, onSessionChange, providers.length, selectionChip]);
}
