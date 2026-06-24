import { syntaxTree } from '@codemirror/language';
import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

const FREEZE_TAIL_MS = 100;

const setFrozen = StateEffect.define<boolean>();

const previewFrozenField = StateField.define<boolean>({
  create: () => false,
  update(previous, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setFrozen)) {
        return effect.value;
      }
    }

    return previous;
  },
});

const lineClassByNodeName: Record<string, string> = {
  ATXHeading1: 'cm-hackmd-h1',
  ATXHeading2: 'cm-hackmd-h2',
  ATXHeading3: 'cm-hackmd-h3',
  ATXHeading4: 'cm-hackmd-h4',
  ATXHeading5: 'cm-hackmd-h5',
  ATXHeading6: 'cm-hackmd-h6',
  SetextHeading1: 'cm-hackmd-h1',
  SetextHeading2: 'cm-hackmd-h2',
  Blockquote: 'cm-hackmd-blockquote',
  FencedCode: 'cm-hackmd-fenced-code',
  HorizontalRule: 'cm-hackmd-hr',
};

const inlineMarkClassByNodeName: Record<string, string> = {
  StrongEmphasis: 'cm-hackmd-strong',
  Emphasis: 'cm-hackmd-em',
  Strikethrough: 'cm-hackmd-strike',
  InlineCode: 'cm-hackmd-inline-code',
  Link: 'cm-hackmd-link',
  Image: 'cm-hackmd-image',
};

const hideableSyntaxNodeNames = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'URL',
  'LinkTitle',
  'StrikethroughMark',
  'QuoteMark',
  'Escape',
]);

type PreviewRange = {
  from: number;
  to: number;
  decoration: Decoration;
};

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
    return other.checked === this.checked;
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

const inlinePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
      this.decorations = buildDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (update.state.field(previewFrozenField)) {
        this.decorations = update.docChanged ? this.decorations.map(update.changes) : this.decorations;
        return;
      }

      if (update.docChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildDecorations(update.state);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

const freezeMousePlugin = ViewPlugin.fromClass(
  class {
    private pointerIsDown = false;
    private releaseTimer: number | null = null;

    private readonly handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node) || !this.view.contentDOM.contains(target)) {
        return;
      }

      this.pointerIsDown = true;
      if (this.releaseTimer !== null) {
        window.clearTimeout(this.releaseTimer);
        this.releaseTimer = null;
      }

      if (!this.view.state.field(previewFrozenField)) {
        this.view.dispatch({ effects: setFrozen.of(true) });
      }
    };

    private readonly handlePointerUp = () => {
      if (!this.pointerIsDown) {
        return;
      }

      this.pointerIsDown = false;
      if (this.releaseTimer !== null) {
        window.clearTimeout(this.releaseTimer);
      }

      this.releaseTimer = window.setTimeout(() => {
        this.releaseTimer = null;
        if (!this.view.state.field(previewFrozenField)) {
          return;
        }

        try {
          this.view.dispatch({ effects: setFrozen.of(false) });
        } catch {
          // The editor may have unmounted before the delayed release.
        }
      }, FREEZE_TAIL_MS);
    };

    constructor(readonly view: EditorView) {
      view.dom.addEventListener('pointerdown', this.handlePointerDown, true);
      window.addEventListener('pointerup', this.handlePointerUp);
      window.addEventListener('pointercancel', this.handlePointerUp);
    }

    destroy() {
      this.view.dom.removeEventListener('pointerdown', this.handlePointerDown, true);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointercancel', this.handlePointerUp);
      if (this.releaseTimer !== null) {
        window.clearTimeout(this.releaseTimer);
      }
    }
  },
);

export function hackmdInlinePreview(): Extension {
  return [
    previewFrozenField,
    freezeMousePlugin,
    inlinePreviewPlugin,
  ];
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: PreviewRange[] = [];
  const activeLines = getActiveLines(state);

  addFrontmatterRanges(state, ranges);
  addHackmdLineSyntaxRanges(state, activeLines, ranges);

  syntaxTree(state).iterate({
    enter(node) {
      const lineClass = lineClassByNodeName[node.name];
      if (lineClass) {
        addLineClass(state, ranges, node.from, node.to, lineClass);
      }

      const markClass = inlineMarkClassByNodeName[node.name];
      if (markClass && node.to > node.from) {
        ranges.push({
          from: node.from,
          to: node.to,
          decoration: Decoration.mark({ class: markClass }),
        });
      }

      if (node.name === 'ListMark') {
        addListMarker(state, activeLines, ranges, node.from, node.to);
        return;
      }

      if (node.name === 'TaskMarker') {
        addTaskMarker(state, activeLines, ranges, node.from, node.to);
        return;
      }

      if (hideableSyntaxNodeNames.has(node.name)) {
        addHiddenSyntax(state, activeLines, ranges, node.from, node.to, node.name);
      }
    },
  });

  ranges.sort((left, right) => {
    if (left.from !== right.from) {
      return left.from - right.from;
    }

    return left.to - right.to;
  });

  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) {
    if (range.to < range.from) {
      continue;
    }
    builder.add(range.from, range.to, range.decoration);
  }

  return builder.finish();
}

function getActiveLines(state: EditorState): Set<number> {
  const activeLines = new Set<number>();

  for (const range of state.selection.ranges) {
    activeLines.add(state.doc.lineAt(range.from).number);
    activeLines.add(state.doc.lineAt(range.to).number);
  }

  return activeLines;
}

function isInactiveSingleLineRange(state: EditorState, activeLines: Set<number>, from: number, to: number) {
  if (to <= from) {
    return false;
  }

  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));

  return startLine.number === endLine.number && !activeLines.has(startLine.number);
}

function addLineClass(state: EditorState, ranges: PreviewRange[], from: number, to: number, className: string) {
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    ranges.push({
      from: line.from,
      to: line.from,
      decoration: Decoration.line({ attributes: { class: className } }),
    });
  }
}

function addHiddenSyntax(
  state: EditorState,
  activeLines: Set<number>,
  ranges: PreviewRange[],
  from: number,
  to: number,
  nodeName: string,
) {
  if (!isInactiveSingleLineRange(state, activeLines, from, to)) {
    return;
  }

  let hideTo = to;
  if ((nodeName === 'HeaderMark' || nodeName === 'QuoteMark') && state.sliceDoc(to, to + 1) === ' ') {
    hideTo += 1;
  }

  ranges.push({
    from,
    to: hideTo,
    decoration: Decoration.replace({}),
  });
}

function addListMarker(
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
    ranges.push({
      from,
      to,
      decoration: Decoration.replace({ widget: new BulletWidget() }),
    });
  }
}

function addTaskMarker(
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

  ranges.push({
    from,
    to,
    decoration: Decoration.replace({
      widget: new TaskCheckboxWidget(marker === '[x]', from, to),
    }),
  });
}

function addFrontmatterRanges(state: EditorState, ranges: PreviewRange[]) {
  if (state.doc.lines < 3 || state.doc.line(1).text.trim() !== '---') {
    return;
  }

  for (let lineNumber = 2; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (line.text.trim() === '---') {
      for (let frontmatterLine = 1; frontmatterLine <= lineNumber; frontmatterLine += 1) {
        const targetLine = state.doc.line(frontmatterLine);
        ranges.push({
          from: targetLine.from,
          to: targetLine.from,
          decoration: Decoration.line({ attributes: { class: 'cm-hackmd-frontmatter' } }),
        });
      }
      return;
    }
  }
}

function addHackmdLineSyntaxRanges(state: EditorState, activeLines: Set<number>, ranges: PreviewRange[]) {
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const text = line.text;
    const calloutMatch = text.match(/^>\s*\[!(note|tip|warning|danger|todo)\]/i);
    const containerMatch = text.match(/^:::\s*(info|success|warning|danger|spoiler)\b/i);

    if (calloutMatch) {
      ranges.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({ attributes: { class: 'cm-hackmd-callout' } }),
      });
      if (!activeLines.has(lineNumber)) {
        const markerStart = text.indexOf('[!');
        const markerText = text.slice(markerStart).match(/^\[![^\]]+\]/)?.[0];
        if (markerStart >= 0 && markerText) {
          ranges.push({
            from: line.from + markerStart,
            to: line.from + markerStart + markerText.length,
            decoration: Decoration.mark({ class: 'cm-hackmd-strong' }),
          });
        }
      }
    }

    if (containerMatch) {
      ranges.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({ attributes: { class: 'cm-hackmd-container' } }),
      });
    }
  }
}
