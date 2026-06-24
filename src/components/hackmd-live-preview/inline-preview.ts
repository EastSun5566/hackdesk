import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

import { treeGrowthEffect } from './tree-progress';

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

const linkChildSyntaxNodeNames = new Set(['LinkMark', 'URL', 'LinkTitle']);

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

const hfmFenceLanguages = new Set([
  'csvpreview',
  'sequence',
  'flow',
  'graphviz',
  'mermaid',
  'abc',
  'plantuml',
  'vega',
  'fretboard',
]);

type PreviewRange = Range<Decoration>;

type SyntaxNodeLike = {
  from: number;
  name: string;
  node: {
    parent: SyntaxNodeParentLike | null;
  };
  to: number;
};

type SyntaxNodeParentLike = {
  from: number;
  name: string;
  parent: SyntaxNodeParentLike | null;
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

const inlinePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
      this.decorations = buildDecorations(view.state);
    }

    update(update: ViewUpdate) {
      const treeGrew = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(treeGrowthEffect)),
      );

      if (update.state.field(previewFrozenField)) {
        this.decorations = update.docChanged || treeGrew
          ? buildDecorations(update.state)
          : this.decorations;
        return;
      }

      if (update.docChanged || update.selectionSet || update.focusChanged || treeGrew) {
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

function pushReplace(
  ranges: PreviewRange[],
  doc: Text,
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.replace>[0] = {},
) {
  if (from >= to) {
    return;
  }

  const startLine = doc.lineAt(from);
  if (to <= startLine.to) {
    ranges.push(Decoration.replace(spec).range(from, to));
    return;
  }

  let cursor = from;
  let firstSegment = true;
  while (cursor < to) {
    const line = doc.lineAt(cursor);
    const segmentTo = Math.min(to, line.to);
    if (segmentTo > cursor) {
      ranges.push(Decoration.replace(firstSegment ? spec : {}).range(cursor, segmentTo));
      firstSegment = false;
    }
    cursor = line.to + 1;
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: PreviewRange[] = [];
  const activeLines = getActiveLines(state);
  const activeInlineSourceStarts = new Set<number>();

  addFrontmatterRanges(state, ranges);
  addHackmdLineSyntaxRanges(state, activeLines, ranges);

  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);

  tree.iterate({
    enter(node) {
      if (node.name === 'FencedCode') {
        const startLine = state.doc.lineAt(node.from).number;
        const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        let fenceIsActive = false;
        for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
          if (activeLines.has(lineNumber)) {
            fenceIsActive = true;
            break;
          }
        }
        if (fenceIsActive) {
          for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
            activeLines.add(lineNumber);
          }
        }
      }

      if (node.name === 'Link' || node.name === 'Image') {
        for (const range of state.selection.ranges) {
          if (range.from <= node.to && range.to >= node.from) {
            activeInlineSourceStarts.add(node.from);
            break;
          }
        }
      }

      const lineClass = lineClassByNodeName[node.name];
      if (lineClass) {
        addLineClass(state, ranges, node.from, node.to, lineClass);
      }

      const markClass = inlineMarkClassByNodeName[node.name];
      if (markClass && node.to > node.from) {
        ranges.push(Decoration.mark({ class: markClass }).range(node.from, node.to));
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
        addHiddenSyntax(state, activeLines, activeInlineSourceStarts, ranges, node);
      }
    },
  });

  return Decoration.set(ranges, true);
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
    ranges.push(Decoration.line({ attributes: { class: className } }).range(line.from));
  }
}

function addHiddenSyntax(
  state: EditorState,
  activeLines: Set<number>,
  activeInlineSourceStarts: Set<number>,
  ranges: PreviewRange[],
  node: SyntaxNodeLike,
) {
  const { from, to, name } = node;
  if (!isInactiveSingleLineRange(state, activeLines, from, to)) {
    return;
  }

  if (linkChildSyntaxNodeNames.has(name)) {
    let parent = node.node.parent;
    while (parent && parent.name !== 'Link' && parent.name !== 'Image') {
      parent = parent.parent;
    }

    if ((parent?.name === 'Link' || parent?.name === 'Image') && activeInlineSourceStarts.has(parent.from)) {
      return;
    }
  }

  let hideTo = to;
  if (name === 'HeaderMark' || name === 'QuoteMark') {
    while (hideTo < state.doc.length && state.sliceDoc(hideTo, hideTo + 1) === ' ') {
      hideTo += 1;
    }
  }

  if (name === 'Escape') {
    hideTo = Math.min(from + 1, to);
  }

  pushReplace(ranges, state.doc, from, hideTo);
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
    pushReplace(ranges, state.doc, from, to, { widget: new BulletWidget() });
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

  pushReplace(ranges, state.doc, from, to, {
    widget: new TaskCheckboxWidget(marker === '[x]', from, to),
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
        ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-frontmatter' } }).range(targetLine.from));
      }
      return;
    }
  }
}

function hasFenceOptions(value: string) {
  return value.includes('=') || value.includes('!') || value.includes('[');
}

function addHackmdLineSyntaxRanges(state: EditorState, activeLines: Set<number>, ranges: PreviewRange[]) {
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const text = line.text;
    const trimmed = text.trim();
    const calloutMatch = text.match(/^>\s*\[!(note|tip|important|warning|caution|danger|todo)\]/i);
    const containerMatch = text.match(/^:::\s*(info|success|warning|danger|spoiler)\b/i);
    const fenceMatch = text.match(/^(```|~~~)\s*([A-Za-z0-9_-]+)?(.*)$/);
    const externalMatch = trimmed.match(/^\{%(youtube|vimeo|gist|slideshare|speakerdeck|pdf|figma)\s+(.+?)\s*%\}$/i);

    if (calloutMatch) {
      const calloutType = calloutMatch[1].toLowerCase();
      ranges.push(Decoration.line({
        attributes: { class: `cm-hackmd-callout cm-hackmd-callout-${calloutType}` },
      }).range(line.from));
      if (!activeLines.has(lineNumber)) {
        const markerStart = text.indexOf('[!');
        const markerText = text.slice(markerStart).match(/^\[![^\]]+\]/)?.[0];
        if (markerStart >= 0 && markerText) {
          ranges.push(Decoration.mark({ class: 'cm-hackmd-strong' }).range(
            line.from + markerStart,
            line.from + markerStart + markerText.length,
          ));
        }
      }
    }

    if (containerMatch) {
      ranges.push(Decoration.line({
        attributes: { class: `cm-hackmd-container cm-hackmd-container-${containerMatch[1].toLowerCase()}` },
      }).range(line.from));
    }

    if (/^#{6}\s+tags:/i.test(text)) {
      ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-tags-line' } }).range(line.from));
    }

    if (/^\[toc\]$/i.test(trimmed) || trimmed === '[[toc]]') {
      ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-toc-line' } }).range(line.from));
    }

    if (/^\[[^\]]+=[^\]]+\](?:\s+\[[^\]]+=[^\]]+\])*\s*$/.test(trimmed)) {
      ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-blockquote-meta' } }).range(line.from));
    }

    if (/^\|.*\|$/.test(trimmed) || /^:?\s*-{3,}/.test(trimmed)) {
      ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-table-line' } }).range(line.from));
    }

    if (trimmed === '$$') {
      ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-math-block-line' } }).range(line.from));
    }

    if (externalMatch) {
      ranges.push(Decoration.line({
        attributes: { class: `cm-hackmd-external-line cm-hackmd-external-${externalMatch[1].toLowerCase()}` },
      }).range(line.from));
    }

    if (fenceMatch) {
      const lang = (fenceMatch[2] ?? '').toLowerCase();
      const meta = fenceMatch[3] ?? '';
      if (hfmFenceLanguages.has(lang)) {
        ranges.push(Decoration.line({ attributes: { class: `cm-hackmd-hfm-fence cm-hackmd-hfm-fence-${lang}` } }).range(line.from));
      } else if (hasFenceOptions(meta) || /[=!]$/.test(lang)) {
        ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-code-fence-options' } }).range(line.from));
      }
    }

    addHackmdInlineSyntaxRanges(line.from, text, ranges);
  }
}

function addHackmdInlineSyntaxRanges(lineFrom: number, text: string, ranges: PreviewRange[]) {
  addRegexMarks(lineFrom, text, ranges, /==([^=\n]+)==/g, 'cm-hackmd-mark');
  addRegexMarks(lineFrom, text, ranges, /\+\+([^+\n]+)\+\+/g, 'cm-hackmd-insert');
  addRegexMarks(lineFrom, text, ranges, /(?<!\w)~([^~\s][^~\n]*?)~/g, 'cm-hackmd-subscript');
  addRegexMarks(lineFrom, text, ranges, /\^([^^\s][^^\n]*?)\^/g, 'cm-hackmd-superscript');
  addRegexMarks(lineFrom, text, ranges, /\{[^{}\n|]+\|[^{}\n|]+\}/g, 'cm-hackmd-ruby');
  addRegexMarks(lineFrom, text, ranges, /\[\^[-\w]+\]/g, 'cm-hackmd-footnote-ref');
  addRegexMarks(lineFrom, text, ranges, /^\s*\[\^[-\w]+\]:/g, 'cm-hackmd-footnote-def');
  addRegexMarks(lineFrom, text, ranges, /^\*\[[^\]\n]+\]:/g, 'cm-hackmd-abbr-def');
  addRegexMarks(lineFrom, text, ranges, /:[A-Za-z0-9_+-]+:/g, 'cm-hackmd-emoji');
  addRegexMarks(lineFrom, text, ranges, /^\s*:\s+.+$/g, 'cm-hackmd-definition-line');
  addRegexMarks(lineFrom, text, ranges, /^\s*~\s+.+$/g, 'cm-hackmd-definition-line');
}

function addRegexMarks(
  lineFrom: number,
  text: string,
  ranges: PreviewRange[],
  pattern: RegExp,
  className: string,
) {
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || match[0].length === 0) {
      continue;
    }

    ranges.push(Decoration.mark({ class: className }).range(
      lineFrom + match.index,
      lineFrom + match.index + match[0].length,
    ));
  }
}
