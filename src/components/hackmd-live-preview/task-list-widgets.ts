import type { EditorState } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';

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

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked
      && other.from === this.from
      && other.to === this.to;
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
          to: this.to,
          insert: this.checked ? '[ ]' : '[x]',
        },
        selection: { anchor: this.to },
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
  ranges: PreviewRange[],
  from: number,
  to: number,
) {
  if (!isInactiveSingleLineRange(state, activeLines, from, to)) {
    return;
  }

  const marker = state.sliceDoc(from, to);
  if (marker === '-' || marker === '*' || marker === '+') {
    pushReplace(ranges, state.doc, from, to, { widget: new BulletWidget() });
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

  pushReplace(ranges, state.doc, from, to, {
    widget: new TaskCheckboxWidget(marker === '[x]', from, to),
  });
}

function isInactiveSingleLineRange(state: EditorState, activeLines: Set<number>, from: number, to: number) {
  if (to <= from) {
    return false;
  }

  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));

  return startLine.number === endLine.number && !activeLines.has(startLine.number);
}
