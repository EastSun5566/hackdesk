import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  StateField,
  type Extension,
  type Range,
  type EditorState,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

import { getActiveLines } from './hfm-decoration-ranges';
import { fenceOpenPattern } from './hfm-patterns';
import {
  parseCsvPreview,
  renderMath,
  renderMermaid,
  resolveEmojiShortcode,
  type CsvPreviewModel,
} from './rich-preview-adapters';
import { treeGrowthEffect } from './tree-progress';

type FencePreview = {
  content: string;
  from: number;
  language: string;
  meta: string;
  to: number;
};

const richFenceLanguages = new Set(['csvpreview', 'math', 'tex', 'latex', 'mermaid']);
const mathFenceLanguages = new Set(['math', 'tex', 'latex']);
const emojiPattern = /:([A-Za-z0-9_+-]+):/g;
const inlineMathPattern = /(?<!\\)\$(?!\s|\$)((?:\\.|[^\n$\\])+(?<!\s|\$))\$/g;
const fontAwesomeTagPattern = /<i\s+class=(["'])([^"']+)\1\s*><\/i>/gi;
const safeFontAwesomeClassPattern = /^(?:fa|fas|far|fab|fa-solid|fa-regular|fa-brands|fa-fw|fa-[a-z0-9-]+)$/;

class EmojiWidget extends WidgetType {
  constructor(
    private readonly shortcode: string,
    private readonly emoji: string,
  ) {
    super();
  }

  eq(other: EmojiWidget): boolean {
    return other.shortcode === this.shortcode && other.emoji === this.emoji;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-hackmd-rich-emoji';
    span.setAttribute('aria-label', this.shortcode);
    span.setAttribute('contenteditable', 'false');
    span.textContent = this.emoji;
    return span;
  }
}

class FontAwesomeIconWidget extends WidgetType {
  constructor(private readonly className: string) {
    super();
  }

  eq(other: FontAwesomeIconWidget): boolean {
    return other.className === this.className;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-hackmd-rich-icon';
    span.setAttribute('contenteditable', 'false');
    span.setAttribute('aria-hidden', 'true');

    const icon = document.createElement('i');
    icon.className = this.className;
    span.appendChild(icon);
    return span;
  }
}

class AsyncHtmlWidget extends WidgetType {
  constructor(
    private readonly className: string,
    private readonly label: string,
    private readonly source: string,
    private readonly render: () => Promise<{ html: string }>,
    private readonly sourceFrom: number,
  ) {
    super();
  }

  eq(other: AsyncHtmlWidget): boolean {
    return other.className === this.className
      && other.label === this.label
      && other.source === this.source
      && other.sourceFrom === this.sourceFrom;
  }

  get estimatedHeight(): number {
    return 220;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = this.className;
    wrap.setAttribute('contenteditable', 'false');

    const body = document.createElement('div');
    body.className = 'cm-hackmd-rich-render-body';
    body.textContent = `Rendering ${this.label}...`;
    wrap.appendChild(body);

    this.render()
      .then((result) => {
        if (!wrap.isConnected) {
          return;
        }
        body.innerHTML = result.html;
        view.requestMeasure();
      })
      .catch((error: unknown) => {
        if (!wrap.isConnected) {
          return;
        }
        body.textContent = error instanceof Error ? error.message : `Unable to render ${this.label}.`;
        wrap.classList.add('cm-hackmd-rich-render-error');
        view.requestMeasure();
      });

    wrap.addEventListener('mousedown', (event) => focusSourceLine(event, view, this.sourceFrom));
    return wrap;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click';
  }
}

class CsvPreviewWidget extends WidgetType {
  constructor(
    private readonly model: CsvPreviewModel,
    private readonly sourceFrom: number,
  ) {
    super();
  }

  eq(other: CsvPreviewWidget): boolean {
    return JSON.stringify(other.model) === JSON.stringify(this.model)
      && other.sourceFrom === this.sourceFrom;
  }

  get estimatedHeight(): number {
    const rowCount = this.model.rows.length + (this.model.header ? 1 : 0);
    return Math.min(Math.max(rowCount * 38 + 34, 110), 420);
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-hackmd-table cm-hackmd-csv-preview';
    wrap.setAttribute('contenteditable', 'false');

    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.className = 'cm-hackmd-table-caption';
    caption.textContent = 'CSV preview';
    table.appendChild(caption);

    if (this.model.header) {
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (const cell of this.model.header) {
        const th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = cell;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);
    }

    const body = document.createElement('tbody');
    for (const row of this.model.rows) {
      const tableRow = document.createElement('tr');
      for (const cell of row) {
        const td = document.createElement('td');
        td.textContent = cell;
        tableRow.appendChild(td);
      }
      body.appendChild(tableRow);
    }
    table.appendChild(body);
    wrap.appendChild(table);
    wrap.addEventListener('mousedown', (event) => focusSourceLine(event, view, this.sourceFrom));
    return wrap;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click';
  }
}

class InlineMathWidget extends WidgetType {
  constructor(
    private readonly source: string,
    private readonly sourceFrom: number,
  ) {
    super();
  }

  eq(other: InlineMathWidget): boolean {
    return other.source === this.source && other.sourceFrom === this.sourceFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-hackmd-rich-math-inline';
    span.setAttribute('contenteditable', 'false');
    span.textContent = 'math';

    renderMath(this.source, { display: false })
      .then((result) => {
        if (span.isConnected) {
          span.innerHTML = result.html;
          view.requestMeasure();
        }
      })
      .catch(() => {
        if (span.isConnected) {
          span.textContent = this.source;
          span.classList.add('cm-hackmd-rich-render-error');
          view.requestMeasure();
        }
      });

    span.addEventListener('mousedown', (event) => focusSourceLine(event, view, this.sourceFrom));
    return span;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click';
  }
}

const richPreviewField = StateField.define<DecorationSet>({
  create: (state) => buildRichPreviewDecorations(state),
  update(decorations, transaction) {
    const treeGrew = transaction.effects.some((effect) => effect.is(treeGrowthEffect));
    if (transaction.docChanged || transaction.selection || treeGrew) {
      return buildRichPreviewDecorations(transaction.state);
    }
    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function hackmdRichPreviewWidgets(): Extension {
  return richPreviewField;
}

function buildRichPreviewDecorations(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];
  const activeLines = getActiveLines(state);
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const fencedLineNumbers = new Set<number>();

  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') {
        return;
      }

      for (let lineNumber = state.doc.lineAt(node.from).number; lineNumber <= state.doc.lineAt(Math.max(node.from, node.to - 1)).number; lineNumber += 1) {
        fencedLineNumbers.add(lineNumber);
      }

      const fence = getFencePreview(state, node.from, node.to);
      if (!fence) {
        return false;
      }

      if (!richFenceLanguages.has(fence.language) || blockIsActive(state, activeLines, fence.from, fence.to)) {
        return false;
      }

      const widget = getFenceWidget(fence);
      if (!widget) {
        return false;
      }

      ranges.push(Decoration.replace({
        block: true,
        widget,
      }).range(fence.from, fence.to));
      return false;
    },
  });

  addDollarMathBlocks(state, activeLines, fencedLineNumbers, ranges);
  addInlineWidgets(state, activeLines, fencedLineNumbers, ranges);

  return Decoration.set(ranges, true);
}

function getFenceWidget(fence: FencePreview): WidgetType | null {
  if (fence.language === 'csvpreview') {
    return new CsvPreviewWidget(
      parseCsvPreview(fence.content, parseFenceOptions(fence.meta)),
      fence.from,
    );
  }

  if (fence.language === 'mermaid') {
    return new AsyncHtmlWidget(
      'cm-hackmd-rich-block cm-hackmd-mermaid-preview',
      'Mermaid',
      fence.content,
      () => renderMermaid(fence.content),
      fence.from,
    );
  }

  if (mathFenceLanguages.has(fence.language)) {
    return new AsyncHtmlWidget(
      'cm-hackmd-rich-block cm-hackmd-math-preview',
      'math',
      fence.content,
      () => renderMath(fence.content, { display: true }),
      fence.from,
    );
  }

  return null;
}

function getFencePreview(state: EditorState, from: number, to: number): FencePreview | null {
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));
  const match = startLine.text.match(fenceOpenPattern);
  const language = match?.[2]?.toLowerCase();
  if (!language) {
    return null;
  }

  const contentLines: string[] = [];
  for (let lineNumber = startLine.number + 1; lineNumber <= endLine.number; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (lineNumber === endLine.number && /^(?:```|~~~)\s*$/.test(line.text.trim())) {
      continue;
    }
    contentLines.push(line.text);
  }

  return {
    content: contentLines.join('\n'),
    from: startLine.from,
    language,
    meta: match?.[3] ?? '',
    to: endLine.to,
  };
}

function addDollarMathBlocks(
  state: EditorState,
  activeLines: ReadonlySet<number>,
  fencedLineNumbers: ReadonlySet<number>,
  ranges: Array<Range<Decoration>>,
) {
  let openerLine: number | null = null;
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (fencedLineNumbers.has(lineNumber)) {
      openerLine = null;
      continue;
    }

    const line = state.doc.line(lineNumber);
    if (line.text.trim() !== '$$') {
      continue;
    }

    if (openerLine === null) {
      openerLine = lineNumber;
      continue;
    }

    const startLine = state.doc.line(openerLine);
    const endLine = line;
    const source = state.sliceDoc(startLine.to + 1, endLine.from - 1);
    if (source.trim().length > 0 && !rangeHasActiveLine(activeLines, openerLine, lineNumber)) {
      ranges.push(Decoration.replace({
        block: true,
        widget: new AsyncHtmlWidget(
          'cm-hackmd-rich-block cm-hackmd-math-preview',
          'math',
          source,
          () => renderMath(source, { display: true }),
          startLine.from,
        ),
      }).range(startLine.from, endLine.to));
    }

    openerLine = null;
  }
}

function addInlineWidgets(
  state: EditorState,
  activeLines: ReadonlySet<number>,
  fencedLineNumbers: ReadonlySet<number>,
  ranges: Array<Range<Decoration>>,
) {
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (activeLines.has(lineNumber) || fencedLineNumbers.has(lineNumber)) {
      continue;
    }

    const line = state.doc.line(lineNumber);
    addEmojiWidgets(line.text, line.from, ranges);
    addFontAwesomeWidgets(line.text, line.from, ranges);
    addInlineMathWidgets(line.text, line.from, ranges);
  }
}

function addEmojiWidgets(text: string, lineFrom: number, ranges: Array<Range<Decoration>>) {
  for (const match of text.matchAll(emojiPattern)) {
    const shortcode = match[1];
    const index = match.index;
    if (!shortcode || index === undefined) {
      continue;
    }

    const emoji = resolveEmojiShortcode(shortcode);
    if (!emoji) {
      continue;
    }

    ranges.push(Decoration.replace({
      widget: new EmojiWidget(shortcode, emoji),
    }).range(lineFrom + index, lineFrom + index + match[0].length));
  }
}

function addFontAwesomeWidgets(text: string, lineFrom: number, ranges: Array<Range<Decoration>>) {
  for (const match of text.matchAll(fontAwesomeTagPattern)) {
    const className = match[2];
    const index = match.index;
    if (!className || index === undefined || !isSafeFontAwesomeClassName(className)) {
      continue;
    }

    ranges.push(Decoration.replace({
      widget: new FontAwesomeIconWidget(normalizeFontAwesomeClassName(className)),
    }).range(lineFrom + index, lineFrom + index + match[0].length));
  }
}

function addInlineMathWidgets(text: string, lineFrom: number, ranges: Array<Range<Decoration>>) {
  for (const match of text.matchAll(inlineMathPattern)) {
    const source = match[1];
    const index = match.index;
    if (!source || index === undefined) {
      continue;
    }

    ranges.push(Decoration.replace({
      widget: new InlineMathWidget(source, lineFrom + index),
    }).range(lineFrom + index, lineFrom + index + match[0].length));
  }
}

function isSafeFontAwesomeClassName(className: string): boolean {
  const classes = className.trim().split(/\s+/);
  return classes.length > 0
    && classes.every((part) => safeFontAwesomeClassPattern.test(part))
    && classes.some((part) => /^fa-[a-z0-9-]+$/.test(part) && part !== 'fa-fw');
}

function normalizeFontAwesomeClassName(className: string): string {
  const classes = new Set(className.trim().split(/\s+/));
  if (classes.has('fa')) {
    classes.add('fa-solid');
  }
  return Array.from(classes).join(' ');
}

function parseFenceOptions(meta: string): { delimiter?: string; header?: boolean } {
  const options: { delimiter?: string; header?: boolean } = {};
  for (const match of meta.matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g)) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (key === 'delimiter') {
      options.delimiter = value;
    }
    if (key === 'header') {
      options.header = value.toLowerCase() === 'true';
    }
  }
  return options;
}

function blockIsActive(state: EditorState, activeLines: ReadonlySet<number>, from: number, to: number): boolean {
  const startLine = state.doc.lineAt(from).number;
  const endLine = state.doc.lineAt(Math.max(from, to - 1)).number;
  return rangeHasActiveLine(activeLines, startLine, endLine);
}

function rangeHasActiveLine(activeLines: ReadonlySet<number>, startLine: number, endLine: number): boolean {
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    if (activeLines.has(lineNumber)) {
      return true;
    }
  }
  return false;
}

function focusSourceLine(event: Event, view: EditorView, sourceFrom: number) {
  event.preventDefault();
  event.stopPropagation();
  view.focus();
  view.dispatch({
    selection: { anchor: sourceFrom },
    scrollIntoView: false,
  });
}
