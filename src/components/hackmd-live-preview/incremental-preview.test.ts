import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorState, type Extension, type TransactionSpec } from '@codemirror/state';
import { EditorView, type DecorationSet, type WidgetType } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { hackmdPanelSpacing } from './block-spacing';
import { getCodeFences } from './code-fences';
import { hackmdTables } from './hackmd-tables';
import { getOrderedListMarkerPreviews } from './list-markers';
import { noteEmbeds } from './note-embeds/extension';
import { hackmdRichPreviewWidgets } from './rich-preview-widgets';

// The preview fields reuse earlier work when a transaction allows it (selection-only changes).
// Whatever they reuse, the result must equal building from scratch.
const extensions: Extension = [
  markdown({ base: markdownLanguage }),
  hackmdRichPreviewWidgets(),
  hackmdTables(),
  hackmdPanelSpacing(),
  noteEmbeds({ describe: async () => null, open: () => {} }),
];

const seedDocument = [
  '# Title :smile: and $x^2$',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  'after table',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '```mermaid',
  'graph TD; A-->B',
  '```',
  '> quote <i class="fa fa-star"></i>',
  '',
  '1. one',
  '2. two',
  '   - nested $y$',
  '',
  '{%hackmd abc %}',
  '```csvpreview',
  'a,b',
  '```',
  'Last line with $$z$$ display.',
].join('\n');

const snippets = ['x', ' ', '|', '$', ':', '\n', '`', '-', '| c | d |', '\n$$\n', ':tada:', '```\n', '1. ', '> ', '{%hackmd x %}'];

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomTransaction(state: EditorState, next: () => number): TransactionSpec {
  const length = state.doc.length;
  const head = state.selection.main.head;
  const pick = next();
  if (pick < 0.45) {
    const insert = snippets[Math.floor(next() * snippets.length)];
    return { changes: { from: head, insert }, selection: { anchor: head + insert.length }, userEvent: 'input.type' };
  }
  if (pick < 0.6 && head > 0) {
    return { changes: { from: head - 1, to: head }, selection: { anchor: head - 1 }, userEvent: 'delete.backward' };
  }
  if (pick < 0.7) {
    // An edit elsewhere while the cursor stays put, as a collaborator's or a command's would be.
    const at = Math.floor(next() * (length + 1));
    return { changes: { from: at, insert: snippets[Math.floor(next() * snippets.length)] } };
  }
  if (pick < 0.9) {
    return { selection: { anchor: Math.floor(next() * (length + 1)) }, userEvent: 'select' };
  }
  return { selection: { anchor: Math.floor(next() * (length + 1)), head: Math.floor(next() * (length + 1)) }, userEvent: 'select' };
}

function describeDecorations(state: EditorState) {
  const sets = state.facet(EditorView.decorations).filter((value): value is DecorationSet => typeof value !== 'function');
  return sets.map((set) => {
    const rows: Array<{ from: number; to: number; widget: WidgetType | undefined; spec: string }> = [];
    set.between(0, state.doc.length, (from, to, value) => {
      const { widget, ...spec } = value.spec as { widget?: WidgetType };
      rows.push({ from, to, widget, spec: JSON.stringify(spec) });
    });
    return rows;
  });
}

function expectSameAsFresh(state: EditorState, step: string) {
  const fresh = EditorState.create({ doc: state.doc, selection: state.selection, extensions });
  const actual = describeDecorations(state);
  const expected = describeDecorations(fresh);
  const plain = (sets: typeof actual) => sets.map((rows) => rows.map(({ from, to, widget, spec }) => ({
    from, to, spec, widget: widget?.constructor.name,
  })));
  expect(plain(actual), step).toEqual(plain(expected));
  actual.forEach((rows, setIndex) => rows.forEach((row, rowIndex) => {
    const other = expected[setIndex][rowIndex].widget;
    if (row.widget && other) expect(row.widget.eq(other), `${step}: widget at ${row.from}`).toBe(true);
  }));
}

describe('incremental preview updates', () => {
  it.each([1, 2, 3, 4, 5, 101, 106, 110])('match a fresh build after random edits and cursor moves (seed %i)', (seed) => {
    const next = random(seed);
    let state = EditorState.create({ doc: seedDocument, extensions });
    for (let step = 0; step < 150; step += 1) {
      const spec = randomTransaction(state, next);
      state = state.update(spec).state;
      expectSameAsFresh(state, `seed ${seed} step ${step}: ${JSON.stringify(spec)}`);
    }
  });

  it('extends a table widget when a row is typed right below it', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |\n\npara';
    let state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions });
    const below = doc.indexOf('\n\n') + 1;
    state = state.update({ selection: { anchor: below } }).state;
    state = state.update({ changes: { from: below, insert: 'x' }, selection: { anchor: below + 1 }, userEvent: 'input.type' }).state;
    expectSameAsFresh(state, 'typed below the table');
  });
});

describe('rich preview widgets', () => {
  const doc = ['Hi :smile: and $x$', '', '$$', 'E = mc^2', '$$', '', '```mermaid', 'A-->B', '```', 'end'].join('\n');
  const widgetLines = (state: EditorState) => {
    const lines: number[] = [];
    const set = state.facet(EditorView.decorations).find((value): value is DecorationSet => typeof value !== 'function')!;
    set.between(0, state.doc.length, (from) => { lines.push(state.doc.lineAt(from).number); });
    return lines;
  };

  it('opens only the widgets on the cursor lines, and closes them when it leaves', () => {
    let state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [markdown({ base: markdownLanguage }), hackmdRichPreviewWidgets()] });
    expect(widgetLines(state)).toEqual([1, 1, 3, 7]);
    state = state.update({ selection: { anchor: 1 } }).state;
    expect(widgetLines(state)).toEqual([3, 7]);
    state = state.update({ selection: { anchor: state.doc.line(4).from } }).state;
    expect(widgetLines(state)).toEqual([1, 1, 7]);
    state = state.update({ selection: { anchor: state.doc.line(5).to, head: state.doc.line(8).from } }).state;
    expect(widgetLines(state)).toEqual([1, 1]);
    state = state.update({ selection: { anchor: doc.length } }).state;
    expect(widgetLines(state)).toEqual([1, 1, 3, 7]);
  });
});

describe('whole-document scans', () => {
  it('find fences inside lists and quotes, and ordered markers at their line offsets', () => {
    const doc = ['para `code`', '- item', '  ```js', '  x', '  ```', '> ```py', '> y', '> ```', '1. a', '2. b'].join('\n');
    const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
    expect([...getCodeFences(state, syntaxTree(state)).keys()]).toEqual([3, 6]);
    expect([...getOrderedListMarkerPreviews(state).values()].map((marker) => [marker.lineNumber, marker.from, marker.display]))
      .toEqual([[9, state.doc.line(9).from, '1.'], [10, state.doc.line(10).from, '2.']]);
  });
});
