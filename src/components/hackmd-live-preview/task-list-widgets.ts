import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

import { getListMarkerPreviewKey, type ListMarkerPreview } from './list-markers';
import { pushReplace, type PreviewRange } from './preview-ranges';

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'cm-hackmd-list-marker';
    marker.textContent = '•';
    return marker;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class OrderedListMarkerWidget extends WidgetType {
  constructor(private readonly display: string) {
    super();
  }

  eq(other: OrderedListMarkerWidget): boolean {
    return other.display === this.display;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'cm-hackmd-list-marker cm-hackmd-ordered-list-marker';
    marker.textContent = this.display;
    return marker;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly markerTo: number,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked
      && other.from === this.from
      && other.markerTo === this.markerTo;
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.checked;
    checkbox.className = 'cm-hackmd-task-checkbox';
    checkbox.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete');
    checkbox.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    checkbox.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.markerTo,
          insert: this.checked ? '[ ]' : '[x]',
        },
        selection: { anchor: this.markerTo },
      });
      view.focus();
    });
    return checkbox;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

export function addListMarker(
  state: EditorState,
  activeLines: Set<number>,
  orderedListMarkers: Map<string, ListMarkerPreview>,
  ranges: PreviewRange[],
  from: number,
  to: number,
) {
  const line = state.doc.lineAt(from);
  addListLineIndent(ranges, line.from, from - line.from);

  if (!isInactiveSingleLineRange(state, activeLines, from, to)) {
    return;
  }

  const taskLead = line.text.match(/^(\s*[-*+]\s+)\[[ xX]\]/);
  if (taskLead) {
    pushReplace(ranges, state.doc, from, line.from + taskLead[1].length);
    return;
  }

  const marker = state.sliceDoc(from, to);
  const hasTrailingSpace = state.sliceDoc(to, to + 1) === ' ';
  const replaceTo = hasTrailingSpace ? to + 1 : to;
  if (marker === '-' || marker === '*' || marker === '+') {
    pushReplace(ranges, state.doc, from, replaceTo, { widget: new BulletWidget() });
    return;
  }

  const ordered = orderedListMarkers.get(getListMarkerPreviewKey(from, to));
  if (ordered) {
    pushReplace(ranges, state.doc, from, replaceTo, {
      widget: new OrderedListMarkerWidget(ordered.display),
    });
  }
}

export function addTaskMarker(
  state: EditorState,
  activeLines: Set<number>,
  ranges: PreviewRange[],
  from: number,
  to: number,
) {
  if (!isInactiveSingleLineRange(state, activeLines, from, to)) {
    return;
  }

  const marker = state.sliceDoc(from, to).toLowerCase();
  if (marker !== '[ ]' && marker !== '[x]') {
    return;
  }

  const replaceTo = state.sliceDoc(to, to + 1) === ' ' ? to + 1 : to;
  pushReplace(ranges, state.doc, from, to, {
    widget: new TaskCheckboxWidget(marker === '[x]', from, to),
    inclusive: false,
  });
  if (replaceTo > to) {
    pushReplace(ranges, state.doc, to, replaceTo);
  }
}

function isInactiveSingleLineRange(state: EditorState, activeLines: Set<number>, from: number, to: number) {
  if (to <= from) {
    return false;
  }

  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));

  return startLine.number === endLine.number && !activeLines.has(startLine.number);
}

const LIST_MARKER_BASE_EM = 0.8;
const LIST_MARKER_ALCOVE_EM = 1.2;
const LIST_MARKER_LEVEL_EM = 0.6;

function getListLineStyle(rawIndent: number) {
  const depth = Math.max(0, Math.floor(rawIndent / 2));
  const padding = LIST_MARKER_BASE_EM + LIST_MARKER_ALCOVE_EM + depth * LIST_MARKER_LEVEL_EM;

  return `padding-left: ${padding}em; text-indent: -${LIST_MARKER_ALCOVE_EM}em`;
}

function addListLineIndent(ranges: PreviewRange[], lineFrom: number, rawIndent: number) {
  ranges.push(
    Decoration.line({
      attributes: {
        class: 'cm-hackmd-list-line',
        style: getListLineStyle(rawIndent),
      },
    }).range(lineFrom),
  );
}
