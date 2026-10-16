import { Annotation, StateEffect, StateField, Transaction, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { AiDelivery } from '@/lib/ai';

/** `menu`: choosing a command; `running`: the answer is streaming; `preview`: waiting for Accept or Discard. */
export type AiInlinePhase = 'idle' | 'menu' | 'running' | 'preview' | 'error';

export type AiInlineState = {
  phase: AiInlinePhase;
  /** The text the session works on, mapped through edits made elsewhere. */
  from: number;
  to: number;
  original: string;
  output: string;
  delivery: AiDelivery;
  error: string | null;
  /** Counts sessions, so a stale answer cannot land in a newer one. */
  session: number;
};

export const IDLE_AI_INLINE: AiInlineState = {
  phase: 'idle',
  from: 0,
  to: 0,
  original: '',
  output: '',
  delivery: 'replace',
  error: null,
  session: 0,
};

export const openAiInline = StateEffect.define<{ from: number; to: number }>();
export const startAiInlineRun = StateEffect.define<{ delivery: AiDelivery }>();
export const appendAiInlineOutput = StateEffect.define<{ session: number; text: string }>();
export const finishAiInlineRun = StateEffect.define<{ session: number; output: string }>();
export const failAiInlineRun = StateEffect.define<{ session: number; message: string }>();
export const closeAiInline = StateEffect.define<null>();

/** Marks the transaction that applies an accepted answer, which must not count as an edit under it. */
const acceptedAiEdit = Annotation.define<boolean>();

function touchesRange(tr: Transaction, from: number, to: number) {
  let touched = false;
  tr.changes.iterChangedRanges((changeFrom, changeTo) => {
    if (changeFrom < to && changeTo > from) touched = true;
    else if (changeFrom === changeTo && changeFrom > from && changeFrom < to) touched = true;
  });
  return touched;
}

export const aiInlineField = StateField.define<AiInlineState>({
  create: () => IDLE_AI_INLINE,
  update(value, tr) {
    let next = value;
    if (tr.docChanged && next.phase !== 'idle') {
      // Editing the text the answer is for makes the answer meaningless.
      next = !tr.annotation(acceptedAiEdit) && touchesRange(tr, next.from, next.to)
        ? { ...IDLE_AI_INLINE, session: next.session }
        : { ...next, from: tr.changes.mapPos(next.from, 1), to: tr.changes.mapPos(next.to, -1) };
    }
    for (const effect of tr.effects) {
      if (effect.is(openAiInline)) {
        const { from, to } = effect.value;
        next = {
          ...IDLE_AI_INLINE,
          phase: 'menu',
          from,
          to,
          original: tr.state.sliceDoc(from, to),
          session: next.session + 1,
        };
      } else if (effect.is(startAiInlineRun) && next.phase !== 'idle') {
        next = { ...next, phase: 'running', delivery: effect.value.delivery, output: '', error: null };
      } else if (effect.is(appendAiInlineOutput) && next.phase === 'running' && effect.value.session === next.session) {
        next = { ...next, output: next.output + effect.value.text };
      } else if (effect.is(finishAiInlineRun) && next.phase === 'running' && effect.value.session === next.session) {
        next = { ...next, phase: 'preview', output: effect.value.output };
      } else if (effect.is(failAiInlineRun) && next.phase === 'running' && effect.value.session === next.session) {
        next = { ...next, phase: 'error', error: effect.value.message };
      } else if (effect.is(closeAiInline)) {
        next = { ...IDLE_AI_INLINE, session: next.session };
      }
    }
    return next;
  },
});

export function getAiInlineState(state: EditorState) {
  return state.field(aiInlineField, false) ?? IDLE_AI_INLINE;
}

/** The selection, or the whole note when nothing is selected. */
export function getAiInlineTarget(state: EditorState) {
  const { from, to } = state.selection.main;
  if (state.sliceDoc(from, to).trim()) return { from, to };
  return { from: 0, to: state.doc.length };
}

/** Applies the previewed answer as one undoable edit and selects what was written. */
export function acceptAiInline(view: EditorView) {
  const session = getAiInlineState(view.state);
  const output = session.output.trim();
  if (session.phase !== 'preview' || !output) return false;
  if (view.state.sliceDoc(session.from, session.to) !== session.original) {
    view.dispatch({ effects: closeAiInline.of(null) });
    return false;
  }
  const insertAt = session.delivery === 'replace' ? session.from : view.state.doc.lineAt(session.to).to;
  const insert = session.delivery === 'replace' ? output : `\n\n${output}`;
  const start = session.delivery === 'replace' ? insertAt : insertAt + 2;
  view.dispatch({
    changes: session.delivery === 'replace'
      ? { from: session.from, to: session.to, insert }
      : { from: insertAt, insert },
    selection: { anchor: start, head: start + output.length },
    effects: closeAiInline.of(null),
    annotations: [acceptedAiEdit.of(true), Transaction.userEvent.of('input.ai')],
    scrollIntoView: true,
  });
  return true;
}
