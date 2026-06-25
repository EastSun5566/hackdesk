import {
  ensureSyntaxTree,
  syntaxTree,
} from '@codemirror/language';
import {
  EditorSelection,
  Prec,
  StateField,
  Transaction,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type DecorationSet,
} from '@codemirror/view';

import { treeGrowthEffect } from './tree-progress';

export type TableModel = {
  header: string[];
  rows: string[][];
};

type MarkdownSyntaxNode = {
  from: number;
  name: string;
  parent: MarkdownSyntaxNode | null;
  to: number;
};

export function splitRowCells(line: string): string[] {
  let source = line.trim();
  if (source.startsWith('|')) {
    source = source.slice(1);
  }
  if (source.endsWith('|')) {
    source = source.slice(0, -1);
  }

  const cells: string[] = [];
  let buffer = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\' && index + 1 < source.length) {
      buffer += char + source[index + 1];
      index += 1;
      continue;
    }

    if (char === '|') {
      cells.push(buffer.trim());
      buffer = '';
      continue;
    }

    buffer += char;
  }

  cells.push(buffer.trim());
  return cells;
}

export function serializeTable(model: TableModel): string {
  const columnCount = model.header.length;
  const lines: string[] = [
    `| ${model.header.map(escapeCell).join(' | ')} |`,
    `| ${model.header.map(() => '---').join(' | ')} |`,
  ];

  for (const row of model.rows) {
    const cells: string[] = [];
    for (let index = 0; index < columnCount; index += 1) {
      cells.push(escapeCell(row[index] ?? ''));
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }

  return lines.join('\n');
}

function escapeCell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/(?<!\\)\|/g, '\\|');
}

function parseTable(state: EditorState, tableNode: { from: number; to: number }): TableModel | null {
  const startLine = state.doc.lineAt(tableNode.from);
  const endLine = state.doc.lineAt(Math.max(tableNode.from, tableNode.to - 1));
  const lines: string[] = [];

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    lines.push(state.doc.line(lineNumber).text);
  }

  if (lines.length < 2) {
    return null;
  }

  const header = splitRowCells(lines[0]);
  if (header.length === 0) {
    return null;
  }

  return {
    header,
    rows: lines.slice(2).map(splitRowCells),
  };
}

function readModelFromDom(wrap: HTMLElement): TableModel {
  const header = Array.from(wrap.querySelectorAll<HTMLElement>('thead th')).map(readCellSource);
  const rows = Array.from(wrap.querySelectorAll<HTMLElement>('tbody tr')).map((row) => (
    Array.from(row.querySelectorAll<HTMLElement>('td')).map(readCellSource)
  ));

  return { header, rows };
}

function readCellSource(cell: HTMLElement): string {
  return (cell.dataset.raw ?? '').trim();
}

function getCellSource(cell: HTMLElement): HTMLElement | null {
  return cell.querySelector<HTMLElement>('.cm-hackmd-table-cell-source');
}

function findCurrentTableRange(view: EditorView, dom: HTMLElement): { from: number; to: number } | null {
  let pos: number;
  try {
    pos = view.posAtDOM(dom);
  } catch {
    return null;
  }
  if (pos < 0) {
    return null;
  }

  const tree = syntaxTree(view.state);
  let node: MarkdownSyntaxNode | null = tree.resolveInner(pos, 1);
  while (node && node.name !== 'Table') {
    node = node.parent;
  }

  if (node) {
    return { from: node.from, to: node.to };
  }

  let foundFrom = -1;
  let foundTo = -1;
  tree.iterate({
    enter(candidate) {
      if (candidate.name !== 'Table') {
        return;
      }
      if (candidate.from <= pos && candidate.to >= pos) {
        foundFrom = candidate.from;
        foundTo = candidate.to;
        return false;
      }
    },
  });

  return foundFrom >= 0 ? { from: foundFrom, to: foundTo } : null;
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getAllCells(wrap: HTMLElement): HTMLElement[] {
  return Array.from(wrap.querySelectorAll<HTMLElement>('th, td'));
}

class TableWidget extends WidgetType {
  constructor(private readonly model: TableModel) {
    super();
  }

  eq(other: TableWidget): boolean {
    return serializeTable(other.model) === serializeTable(this.model);
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-hackmd-table';

    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.className = 'cm-hackmd-table-caption';
    caption.textContent = 'Markdown table';
    table.appendChild(caption);
    wrap.appendChild(table);

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let index = 0; index < this.model.header.length; index += 1) {
      headerRow.appendChild(makeCell('th', this.model.header[index] ?? '', view, `Table header ${index + 1}`));
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let rowIndex = 0; rowIndex < this.model.rows.length; rowIndex += 1) {
      const row = this.model.rows[rowIndex] ?? [];
      const tableRow = document.createElement('tr');
      for (let index = 0; index < this.model.header.length; index += 1) {
        tableRow.appendChild(makeCell('td', row[index] ?? '', view, `Table cell ${rowIndex + 1}, ${index + 1}`));
      }
      tbody.appendChild(tableRow);
    }
    table.appendChild(tbody);

    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function makeCell(tag: 'td' | 'th', text: string, view: EditorView, label: string): HTMLElement {
  const cell = document.createElement(tag);
  cell.dataset.raw = text;
  if (tag === 'th') {
    cell.setAttribute('scope', 'col');
  }

  const source = document.createElement('div');
  source.className = 'cm-hackmd-table-cell-source';
  source.contentEditable = 'true';
  source.setAttribute('role', 'textbox');
  source.setAttribute('aria-label', label);
  source.tabIndex = 0;
  source.spellcheck = true;
  source.textContent = text;
  cell.appendChild(source);

  let composing = false;
  const commit = () => {
    const nextRaw = (source.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (cell.dataset.raw === nextRaw) {
      return;
    }

    cell.dataset.raw = nextRaw;
    dispatchModelFromDom(view, cell);
  };

  source.addEventListener('compositionstart', () => {
    composing = true;
  });
  source.addEventListener('compositionend', () => {
    composing = false;
    commit();
  });
  source.addEventListener('input', (event) => {
    if (composing || (event as InputEvent).isComposing) {
      return;
    }
    commit();
  });
  source.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/\s+/g, ' ').trim();
    const selection = source.ownerDocument.defaultView?.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    commit();
  });
  source.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    moveCellFocus(view, cell, event.shiftKey ? -1 : 1);
  });
  cell.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (target instanceof Node && source.contains(target)) {
      return;
    }

    event.preventDefault();
    source.focus();
    placeCaretAtEnd(source);
  });

  return cell;
}

function dispatchModelFromDom(view: EditorView, cell: HTMLElement): void {
  const wrap = cell.closest<HTMLElement>('.cm-hackmd-table');
  if (!wrap) {
    return;
  }

  const range = findCurrentTableRange(view, wrap);
  if (!range) {
    return;
  }

  const next = serializeTable(readModelFromDom(wrap));
  if (view.state.sliceDoc(range.from, range.to) === next) {
    return;
  }

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: next },
    annotations: Transaction.userEvent.of('input.type'),
  });
}

function moveCellFocus(view: EditorView, cell: HTMLElement, direction: 1 | -1): void {
  const wrap = cell.closest<HTMLElement>('.cm-hackmd-table');
  if (!wrap) {
    return;
  }

  const cells = getAllCells(wrap);
  const index = cells.indexOf(cell);
  if (index < 0) {
    return;
  }

  const nextIndex = index + direction;
  if (nextIndex < 0) {
    getCellSource(cell)?.blur();
    return;
  }

  if (nextIndex >= cells.length) {
    appendRow(view, wrap);
    return;
  }

  const nextSource = getCellSource(cells[nextIndex]);
  if (!nextSource) {
    return;
  }

  nextSource.focus();
  placeCaretAtEnd(nextSource);
}

function appendRow(view: EditorView, wrap: HTMLElement): void {
  const range = findCurrentTableRange(view, wrap);
  if (!range) {
    return;
  }

  const model = readModelFromDom(wrap);
  model.rows.push(model.header.map(() => ''));
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: serializeTable(model) },
  });

  const from = range.from;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const tables = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-hackmd-table'));
      const nextTable = tables.find((candidate) => {
        try {
          return view.posAtDOM(candidate) === from;
        } catch {
          return false;
        }
      });
      const lastRow = nextTable?.querySelector<HTMLElement>('tbody tr:last-child');
      const firstCell = lastRow?.querySelector<HTMLElement>('td');
      const source = firstCell ? getCellSource(firstCell) : null;
      if (!source) {
        return;
      }
      source.focus();
      placeCaretAtEnd(source);
    });
  });
}

function backspaceAtTableBoundary(view: EditorView): boolean {
  return selectTableAtBoundary(view, 'before');
}

function deleteAtTableBoundary(view: EditorView): boolean {
  return selectTableAtBoundary(view, 'after');
}

function selectTableAtBoundary(view: EditorView, side: 'before' | 'after'): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const pos = selection.head;
  if (side === 'before' && pos === 0) {
    return false;
  }

  let tableFrom = -1;
  let tableTo = -1;
  syntaxTree(view.state).iterate({
    from: side === 'before' ? Math.max(0, pos - 2) : pos,
    to: side === 'before' ? pos : Math.min(view.state.doc.length, pos + 2),
    enter(node) {
      if (node.name !== 'Table') {
        return;
      }

      const matches = side === 'before'
        ? node.to === pos || node.to + 1 === pos
        : node.from === pos || node.from === pos + 1;
      if (matches) {
        tableFrom = node.from;
        tableTo = node.to;
        return false;
      }
    },
  });

  if (tableFrom < 0) {
    return false;
  }

  view.dispatch({
    selection: EditorSelection.range(tableFrom, tableTo),
  });
  return true;
}

function buildTableWidgets(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);

  tree.iterate({
    enter(node) {
      if (node.name !== 'Table') {
        return;
      }

      const model = parseTable(state, node.node);
      if (!model) {
        return false;
      }

      const startLine = state.doc.lineAt(node.from);
      const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
      ranges.push(Decoration.replace({
        block: true,
        widget: new TableWidget(model),
      }).range(startLine.from, endLine.to));
      return false;
    },
  });

  return Decoration.set(ranges, true);
}

function changeAffectsTables(transaction: Transaction, existing: DecorationSet): boolean {
  let affected = false;
  transaction.changes.iterChanges((fromA, toA) => {
    if (affected) {
      return;
    }
    existing.between(fromA, toA, () => {
      affected = true;
      return false;
    });
  });

  if (affected) {
    return true;
  }

  transaction.changes.iterChanges((_fromA, _toA, fromB, toB) => {
    if (affected) {
      return;
    }

    const startLine = transaction.state.doc.lineAt(fromB);
    const endLine = toB > startLine.to ? transaction.state.doc.lineAt(toB) : startLine;
    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      if (transaction.state.doc.line(lineNumber).text.includes('|')) {
        affected = true;
        break;
      }
    }
  });

  return affected;
}

const tableField = StateField.define<DecorationSet>({
  create: (state) => buildTableWidgets(state),
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(treeGrowthEffect)) {
        return buildTableWidgets(transaction.state);
      }
    }

    if (!transaction.docChanged) {
      return decorations;
    }

    const mapped = decorations.map(transaction.changes);
    return changeAffectsTables(transaction, decorations)
      ? buildTableWidgets(transaction.state)
      : mapped;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function hackmdTables(): Extension {
  return [
    tableField,
    Prec.high(keymap.of([
      { key: 'Backspace', run: backspaceAtTableBoundary },
      { key: 'Delete', run: deleteAtTableBoundary },
    ])),
  ];
}
