import { SearchQuery } from '@codemirror/search';
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
} from '@codemirror/view';

const REVEAL_FADE_MS = 3200;

const setInitialReveal = StateEffect.define<{ from: number; to: number } | null>();

const initialRevealField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (!effect.is(setInitialReveal)) {
        continue;
      }

      decorations = effect.value
        ? Decoration.set([
          Decoration.mark({ class: 'cm-hackmd-initial-reveal-match' }).range(effect.value.from, effect.value.to),
        ])
        : Decoration.none;
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function initialRevealExtension(): Extension {
  return initialRevealField;
}

export function clearInitialReveal(view: EditorView): void {
  view.dispatch({ effects: setInitialReveal.of(null) });
}

export function revealTextInEditor(view: EditorView, queryText: string): boolean {
  const match = findInitialRevealRange(view.state.doc, queryText);
  if (!match) {
    return false;
  }

  view.dispatch({
    effects: [
      setInitialReveal.of(match),
      EditorView.scrollIntoView(match.from, { y: 'start', yMargin: 72 }),
    ],
  });

  requestAnimationFrame(() => {
    const matchElement = view.dom.querySelector('.cm-hackmd-initial-reveal-match');
    const lineElement = matchElement?.closest('.cm-line') ?? matchElement;
    if (lineElement instanceof HTMLElement) {
      scrollMatchNearTop(lineElement, 72);
    }
  });

  return true;
}

export function scheduleInitialRevealClear(
  view: EditorView,
  currentTimer: number | null,
  setTimer: (timer: number | null) => void,
): void {
  if (currentTimer !== null) {
    window.clearTimeout(currentTimer);
  }

  const timer = window.setTimeout(() => {
    clearInitialReveal(view);
    setTimer(null);
  }, REVEAL_FADE_MS);

  setTimer(timer);
}

function findInitialRevealRange(
  docText: EditorState['doc'],
  queryText: string,
): { from: number; to: number } | null {
  for (const candidate of buildRevealCandidates(queryText)) {
    const query = new SearchQuery({ search: candidate });
    if (!query.valid || !query.search) {
      continue;
    }

    const cursor = query.getCursor(docText);
    const first = cursor.next();
    if (!first.done && first.value.from !== first.value.to) {
      return first.value;
    }
  }

  return null;
}

function buildRevealCandidates(queryText: string): string[] {
  const candidates = new Set<string>();
  const trimmed = queryText.trim();
  if (!trimmed) {
    return [];
  }

  candidates.add(trimmed);

  const collapsed = trimmed.replace(/\s+/g, ' ').trim();
  if (collapsed) {
    candidates.add(collapsed);
  }

  for (const line of trimmed.split('\n')) {
    const cleanLine = line.trim();
    if (!cleanLine) {
      continue;
    }

    candidates.add(cleanLine);
    const collapsedLine = cleanLine.replace(/\s+/g, ' ').trim();
    if (collapsedLine) {
      candidates.add(collapsedLine);
    }
  }

  if (collapsed.length > 140) {
    candidates.add(collapsed.slice(0, 140).trim());
  }
  if (collapsed.length > 80) {
    candidates.add(collapsed.slice(0, 80).trim());
  }

  return [...candidates].filter((candidate) => candidate.length >= 12 || candidate === trimmed);
}

function scrollMatchNearTop(match: HTMLElement, offset: number): void {
  const scrollParent = findScrollParent(match);
  if (!scrollParent) {
    match.scrollIntoView({ block: 'start' });
    return;
  }

  const parentRect = scrollParent.getBoundingClientRect();
  const matchRect = match.getBoundingClientRect();
  const nextTop = scrollParent.scrollTop + (matchRect.top - parentRect.top) - offset;
  scrollParent.scrollTo({ top: Math.max(0, nextTop) });
}

function findScrollParent(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}
