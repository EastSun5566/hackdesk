import { Prec, StateEffect, StateField, Transaction, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view';

import type { DictationEvent } from '@/lib/dictation';

/** `starting`: waiting for the microphone; `finishing`: stopped, recognizing the last words. */
export type DictationPhase = 'idle' | 'starting' | 'recording' | 'finishing';

export type DictationState = {
  phase: DictationPhase;
  /** What the text will replace: the selection when recording began, mapped through later edits. */
  from: number;
  to: number;
  finals: string;
  volatile: string;
  level: number;
  /** Counts sessions, so a late event from an old recording cannot land in a newer one. */
  session: number;
};

export const IDLE_DICTATION: DictationState = { phase: 'idle', from: 0, to: 0, finals: '', volatile: '', level: 0, session: 0 };

/** A recording the host started for the editor. */
export type DictationRecording = {
  /** Stops listening; the host then reports the transcript through `onDone`. */
  stop: () => void;
  cancel: () => void;
};

export type DictationHost = {
  /** Null when dictation is off or unavailable, with the reason already shown. */
  start: (callbacks: {
    onEvent: (event: DictationEvent) => void;
    /** The transcript, or null when the recording was cancelled. */
    onDone: (text: string | null) => void;
    onError: (message: string) => void;
  }) => DictationRecording | null;
  /** The pill's hint, such as "⇧⌘D". */
  shortcutLabel: () => string;
};

const beginDictation = StateEffect.define<{ from: number; to: number }>();
const dictationEvent = StateEffect.define<{ session: number; event: DictationEvent }>();
const finishDictation = StateEffect.define<number>();
const endDictation = StateEffect.define<null>();

export const dictationField = StateField.define<DictationState>({
  create: () => IDLE_DICTATION,
  update(value, tr) {
    let next = value;
    if (tr.docChanged && next.phase !== 'idle') {
      // Text typed at either edge while recording stays outside the range, so finishing keeps it.
      const from = tr.changes.mapPos(next.from, 1);
      next = { ...next, from, to: Math.max(from, tr.changes.mapPos(next.to, -1)) };
    }
    for (const effect of tr.effects) {
      if (effect.is(beginDictation)) {
        next = { ...IDLE_DICTATION, phase: 'starting', ...effect.value, session: next.session + 1 };
      } else if (effect.is(dictationEvent) && next.phase !== 'idle' && effect.value.session === next.session) {
        const event = effect.value.event;
        if (event.type === 'ready' && next.phase === 'starting') next = { ...next, phase: 'recording' };
        else if (event.type === 'level') next = { ...next, level: event.value };
        else if (event.type === 'volatile') next = { ...next, volatile: event.text };
        else if (event.type === 'final') next = { ...next, finals: next.finals + event.text, volatile: '' };
      } else if (effect.is(finishDictation) && next.phase !== 'idle' && effect.value === next.session) {
        next = { ...next, phase: 'finishing', level: 0 };
      } else if (effect.is(endDictation)) {
        next = { ...IDLE_DICTATION, session: next.session };
      }
    }
    return next;
  },
});

export function getDictationState(state: EditorState) {
  return state.field(dictationField, false) ?? IDLE_DICTATION;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;
const OPENING = /[([{"'“‘`*_~]/;
const CLOSING_PUNCTUATION = /^[.,;:!?)\]}"'”’`*_~]/;

/**
 * The transcript as it should be inserted between `before` and `after`: a space where two words
 * of a spaced language would otherwise run together, none around Chinese, Japanese or Korean.
 */
export function joinDictation(before: string, text: string, after: string) {
  const trimmed = text.trim();
  if (!trimmed) return { insert: '', start: 0, length: 0 };
  const needsSpaceBefore = Boolean(before) && !/\s/.test(before) && !OPENING.test(before)
    && !CJK.test(before) && !CJK.test(trimmed[0]!) && !CLOSING_PUNCTUATION.test(trimmed);
  const last = trimmed[trimmed.length - 1]!;
  const needsSpaceAfter = Boolean(after) && !/\s/.test(after) && !CLOSING_PUNCTUATION.test(after)
    && !CJK.test(after) && !CJK.test(last);
  return {
    insert: `${needsSpaceBefore ? ' ' : ''}${trimmed}${needsSpaceAfter ? ' ' : ''}`,
    start: needsSpaceBefore ? 1 : 0,
    length: trimmed.length,
  };
}

/** Writes the transcript in one undoable edit and selects it, ready for ⌘K. */
function insertDictation(view: EditorView, session: number, text: string) {
  const current = getDictationState(view.state);
  if (current.session !== session || current.phase === 'idle') return;
  const { from, to } = current;
  const { doc } = view.state;
  const joined = joinDictation(doc.sliceString(Math.max(0, from - 1), from), text, doc.sliceString(to, Math.min(doc.length, to + 1)));
  if (!joined.insert) {
    view.dispatch({ effects: endDictation.of(null) });
    return;
  }
  const anchor = from + joined.start;
  view.dispatch({
    changes: { from, to, insert: joined.insert },
    selection: { anchor, head: anchor + joined.length },
    effects: endDictation.of(null),
    annotations: Transaction.userEvent.of('input.dictation'),
    scrollIntoView: true,
  });
}

/** The recording behind each editor, so a second press stops it and a closed note cancels it. */
const recordings = new WeakMap<EditorView, { session: number; recording: DictationRecording }>();

function cancelRecording(view: EditorView) {
  const active = recordings.get(view);
  recordings.delete(view);
  active?.recording.cancel();
}

/** Starts dictating at the selection, or stops and inserts when already recording. */
export function toggleDictation(view: EditorView, host: DictationHost) {
  const state = getDictationState(view.state);
  if (state.phase === 'finishing') return true;
  if (state.phase !== 'idle') {
    const active = recordings.get(view);
    if (!active || active.session !== state.session) {
      view.dispatch({ effects: endDictation.of(null) });
      return true;
    }
    active.recording.stop();
    view.dispatch({ effects: finishDictation.of(state.session) });
    return true;
  }

  const { from, to } = view.state.selection.main;
  view.dispatch({ effects: beginDictation.of({ from, to }) });
  const session = getDictationState(view.state).session;
  const isCurrent = () => recordings.get(view)?.session === session && getDictationState(view.state).session === session;
  const recording = host.start({
    onEvent: (event) => {
      if (isCurrent()) view.dispatch({ effects: dictationEvent.of({ session, event }) });
    },
    onDone: (text) => {
      if (!isCurrent()) return;
      recordings.delete(view);
      if (text) insertDictation(view, session, text);
      else view.dispatch({ effects: endDictation.of(null) });
    },
    onError: () => {
      if (!isCurrent()) return;
      recordings.delete(view);
      view.dispatch({ effects: endDictation.of(null) });
    },
  });
  if (!recording) {
    view.dispatch({ effects: endDictation.of(null) });
    return false;
  }
  recordings.set(view, { session, recording });
  return true;
}

class TranscriptWidget extends WidgetType {
  constructor(private readonly finals: string, private readonly volatile: string) {
    super();
  }

  eq(other: TranscriptWidget) {
    return other.finals === this.finals && other.volatile === this.volatile;
  }

  /** Previews the text with the spacing it will be inserted with. */
  static at(state: EditorState, from: number, finals: string, volatile: string) {
    const settled = finals.trimStart();
    const pending = settled ? volatile : volatile.trimStart();
    const spaced = joinDictation(state.sliceDoc(Math.max(0, from - 1), from), settled + pending, '').start > 0;
    return new TranscriptWidget(`${spaced ? ' ' : ''}${settled}`, pending);
  }

  toDOM() {
    const dom = document.createElement('span');
    dom.className = 'cm-dictation-text';
    const settled = dom.appendChild(document.createElement('span'));
    settled.textContent = this.finals;
    const pending = dom.appendChild(document.createElement('span'));
    pending.className = 'cm-dictation-volatile';
    pending.textContent = this.volatile;
    return dom;
  }

  updateDOM(dom: HTMLElement) {
    const [settled, pending] = dom.children;
    if (!settled || !pending) return false;
    settled.textContent = this.finals;
    pending.textContent = this.volatile;
    return true;
  }
}

/** The listening indicator: a level meter and what the keys do. */
class PillWidget extends WidgetType {
  constructor(private readonly phase: DictationPhase, private readonly level: number, private readonly shortcut: string) {
    super();
  }

  eq(other: PillWidget) {
    return other.phase === this.phase && other.level === this.level && other.shortcut === this.shortcut;
  }

  toDOM() {
    const dom = document.createElement('span');
    dom.className = 'cm-dictation-pill';
    dom.setAttribute('role', 'status');
    const meter = dom.appendChild(document.createElement('span'));
    meter.className = 'cm-dictation-meter';
    meter.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) meter.appendChild(document.createElement('span'));
    dom.appendChild(document.createElement('span')).className = 'cm-dictation-hint';
    this.updateDOM(dom);
    return dom;
  }

  updateDOM(dom: HTMLElement) {
    const meter = dom.querySelector<HTMLElement>('.cm-dictation-meter');
    const hint = dom.querySelector<HTMLElement>('.cm-dictation-hint');
    if (!meter || !hint) return false;
    meter.style.setProperty('--dictation-level', String(this.level));
    hint.textContent = this.phase === 'starting' ? 'Starting…'
      : this.phase === 'finishing' ? 'Finishing…'
        : `Listening · ${this.shortcut} or Enter to insert · Esc to cancel`;
    return true;
  }

  ignoreEvent() {
    return true;
  }
}

function buildDecorations(state: EditorState, host: DictationHost): DecorationSet {
  const session = getDictationState(state);
  if (session.phase === 'idle') return Decoration.none;
  const ranges = [];
  if (session.to > session.from) ranges.push(Decoration.mark({ class: 'cm-dictation-target' }).range(session.from, session.to));
  if (session.finals || session.volatile) {
    ranges.push(Decoration.widget({ widget: TranscriptWidget.at(state, session.from, session.finals, session.volatile), side: 1 }).range(session.to));
  }
  ranges.push(Decoration.widget({ widget: new PillWidget(session.phase, session.level, host.shortcutLabel()), side: 2 }).range(session.to));
  return Decoration.set(ranges, true);
}

function dictationKeymap() {
  return Prec.highest(keymap.of([
    {
      key: 'Enter',
      run: (view) => {
        const state = getDictationState(view.state);
        if (state.phase !== 'recording') return state.phase !== 'idle';
        const active = recordings.get(view);
        if (active?.session !== state.session) return false;
        active.recording.stop();
        view.dispatch({ effects: finishDictation.of(state.session) });
        return true;
      },
    },
    {
      key: 'Escape',
      run: (view) => {
        if (getDictationState(view.state).phase === 'idle') return false;
        cancelRecording(view);
        view.dispatch({ effects: endDictation.of(null) });
        return true;
      },
    },
  ]));
}

/** A note closed or switched mid-recording stops the microphone. */
const cancelOnDestroy = ViewPlugin.fromClass(class {
  constructor(private readonly view: EditorView) {}

  destroy() {
    cancelRecording(this.view);
  }
});

const dictationTheme = EditorView.baseTheme({
  '.cm-dictation-target': {
    backgroundColor: 'color-mix(in oklch, var(--primary-default) 14%, transparent)',
    borderRadius: '2px',
  },
  '.cm-dictation-text': {
    color: 'var(--text-default)',
    backgroundColor: 'color-mix(in oklch, var(--primary-default) 10%, transparent)',
    borderRadius: '2px',
    whiteSpace: 'pre-wrap',
  },
  '.cm-dictation-volatile': {
    color: 'var(--text-subtle)',
  },
  '.cm-dictation-pill': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: '6px',
    padding: '1px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: '999px',
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    lineHeight: '18px',
    verticalAlign: 'baseline',
    userSelect: 'none',
  },
  '.cm-dictation-meter': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    height: '12px',
  },
  '.cm-dictation-meter > span': {
    width: '3px',
    height: '12px',
    borderRadius: '2px',
    backgroundColor: 'var(--destructive-default)',
    transformOrigin: 'center',
    transform: 'scaleY(calc(0.25 + var(--dictation-level, 0) * 0.75))',
    transition: 'transform 80ms linear',
  },
  '.cm-dictation-meter > span:nth-child(2)': {
    transform: 'scaleY(calc(0.25 + var(--dictation-level, 0)))',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '.cm-dictation-meter > span': { transition: 'none' },
  },
});

/**
 * Dictation into the note: what is heard shows at the cursor as decorations, and the transcript is
 * written in one undoable edit when the recording ends. Cancelling leaves the note untouched.
 */
export function dictation(host: DictationHost): Extension {
  return [
    dictationField,
    EditorView.decorations.compute([dictationField], state => buildDecorations(state, host)),
    dictationKeymap(),
    cancelOnDestroy,
    dictationTheme,
  ];
}
