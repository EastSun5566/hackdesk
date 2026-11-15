import { describe, expect, it } from 'vitest';

import {
  equalizeLayout,
  layoutPaneIds,
  normalizeSizes,
  paneInDirection,
  paneLeaf,
  paneRects,
  parsePaneLayout,
  reconcileLayout,
  removeLayoutPane,
  resizeLayoutSplit,
  splitLayoutPane,
  type PaneLayoutNode,
} from './pane-layout';

function shape(node: PaneLayoutNode): unknown {
  return node.type === 'pane'
    ? node.paneId
    : { [node.orientation === 'horizontal' ? 'row' : 'column']: node.children.map(shape), sizes: node.sizes.map(Math.round) };
}

// a | b over c, the L shape: a on the left, b above c on the right.
function lShape() {
  const row = splitLayoutPane(paneLeaf('a'), 'a', 'b', 'right');
  return splitLayoutPane(row, 'b', 'c', 'down');
}

function expectUsableSizes(sizes: number[]) {
  sizes.forEach(size => expect(size).toBeGreaterThanOrEqual(10));
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeCloseTo(100, 10);
}

function splitSizes(node: PaneLayoutNode): number[][] {
  return node.type === 'pane' ? [] : [node.sizes, ...node.children.flatMap(splitSizes)];
}

describe('pane size normalization', () => {
  it.each([
    [99, 1],
    [80, 9, 1],
    [50, 25, 12.5, 6.25, 3.125, 3.125],
    [1, 2, 3, 4, 5, 6],
    [Number.MAX_VALUE, Number.MAX_VALUE, Number.MIN_VALUE],
    [Number.MIN_VALUE, Number.MIN_VALUE],
    [10, 20, 69.9999999],
    Array.from({ length: 10 }, (_, index) => index + 1),
  ].map(input => ({ input })))('keeps sizes usable and stable for $input', ({ input }) => {
    const normalized = normalizeSizes(input, input.length);
    expectUsableSizes(normalized);
    const again = normalizeSizes(normalized, normalized.length);
    again.forEach((size, index) => expect(size).toBeCloseTo(normalized[index], 10));
  });

  it('preserves the ratio of panes that do not need the minimum', () => {
    const sizes = normalizeSizes([90, 30, 1], 3);
    expectUsableSizes(sizes);
    expect(sizes[0] / sizes[1]).toBeCloseTo(3, 10);
    expect(sizes[2]).toBe(10);
  });

  it('keeps fallback sizes finite for invalid inputs and infeasible pane counts', () => {
    for (const input of [[], [NaN, 1], [Infinity, 1], [0, 1], [-1, 1]]) {
      expect(normalizeSizes(input, 2)).toEqual([50, 50]);
    }
    expect(normalizeSizes([], 1)).toEqual([100]);
    expect(normalizeSizes(Array(11).fill(1), 11)).toEqual(Array(11).fill(100 / 11));
  });
});

describe('pane layout', () => {
  it('splits beside a pane, joining a split that runs the same way and nesting otherwise', () => {
    const row = splitLayoutPane(paneLeaf('a'), 'a', 'b', 'right');
    expect(shape(row)).toEqual({ row: ['a', 'b'], sizes: [50, 50] });

    // Same direction: b gives half of its space to the new pane.
    expect(shape(splitLayoutPane(row, 'b', 'c', 'right'))).toEqual({ row: ['a', 'b', 'c'], sizes: [50, 25, 25] });
    expect(shape(splitLayoutPane(row, 'a', 'c', 'left'))).toEqual({ row: ['c', 'a', 'b'], sizes: [25, 25, 50] });

    // The other direction nests a column in place of the pane.
    expect(shape(lShape())).toEqual({ row: ['a', { column: ['b', 'c'], sizes: [50, 50] }], sizes: [50, 50] });
  });

  it('removes a pane, hands its space on and lets a one-child split give way', () => {
    const layout = lShape();
    expect(shape(removeLayoutPane(layout, 'c')!)).toEqual({ row: ['a', 'b'], sizes: [50, 50] });
    expect(shape(removeLayoutPane(layout, 'a')!)).toEqual({ column: ['b', 'c'], sizes: [50, 50] });
    expect(removeLayoutPane(paneLeaf('a'), 'a')).toBeNull();
    expect(layoutPaneIds(removeLayoutPane(removeLayoutPane(layout, 'b')!, 'c')!)).toEqual(['a']);
  });

  it('resizes one split by its children ids, keeping every child usable, and equalizes the tree', () => {
    const layout = lShape();
    if (layout.type !== 'split') throw new Error('expected a split');
    const column = layout.children[1];
    if (column.type !== 'split') throw new Error('expected a column');

    const resized = resizeLayoutSplit(layout, column.id, { b: 70, c: 30 });
    expect(shape(resized)).toEqual({ row: ['a', { column: ['b', 'c'], sizes: [70, 30] }], sizes: [50, 50] });
    const constrained = resizeLayoutSplit(layout, layout.id, { a: 99, [column.id]: 1 });
    expect(constrained).toMatchObject({ type: 'split', id: layout.id, children: layout.children });
    splitSizes(constrained).forEach(expectUsableSizes);
    expect(shape(equalizeLayout(resized))).toEqual(shape(layout));
  });

  it('finds the pane in a direction by where panes actually are', () => {
    const layout = lShape();
    expect(paneRects(layout)).toEqual([
      { paneId: 'a', x: 0, y: 0, width: 0.5, height: 1 },
      { paneId: 'b', x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { paneId: 'c', x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ]);
    expect(paneInDirection(layout, 'a', 'right')).toBe('b');
    expect(paneInDirection(layout, 'c', 'left')).toBe('a');
    expect(paneInDirection(layout, 'b', 'down')).toBe('c');
    expect(paneInDirection(layout, 'c', 'up')).toBe('b');
    expect(paneInDirection(layout, 'a', 'left')).toBeNull();
    expect(paneInDirection(layout, 'b', 'up')).toBeNull();

    // In a 2×2 grid, moving across keeps to the same row.
    const grid = splitLayoutPane(splitLayoutPane(lShape(), 'a', 'd', 'down'), 'd', 'd2', 'right');
    expect(paneInDirection(grid, 'd', 'right')).toBe('d2');
    expect(paneInDirection(grid, 'd', 'up')).toBe('a');
  });

  it('reconciles the tree with the panes that exist', () => {
    expect(shape(reconcileLayout(lShape(), ['a', 'c']))).toEqual({ row: ['a', 'c'], sizes: [50, 50] });
    expect(shape(reconcileLayout(paneLeaf('a'), ['a', 'b']))).toEqual({ row: ['a', 'b'], sizes: [50, 50] });
    expect(shape(reconcileLayout(null, ['a']))).toBe('a');
    expect(shape(reconcileLayout(paneLeaf('gone'), ['a']))).toBe('a');
  });

  it('reads saved trees and rejects broken ones', () => {
    const saved = JSON.parse(JSON.stringify(lShape()));
    expect(shape(parsePaneLayout(saved)!)).toEqual(shape(lShape()));
    expect(shape(parsePaneLayout({ ...saved, sizes: ['x', 1] })!)).toEqual({
      row: ['a', { column: ['b', 'c'], sizes: [50, 50] }], sizes: [50, 50],
    });
    expect(parsePaneLayout({ type: 'split', id: 's', orientation: 'diagonal', children: [], sizes: [] })).toBeNull();
    expect(parsePaneLayout({ type: 'split', id: 's', orientation: 'horizontal', children: [paneLeaf('a'), paneLeaf('a')], sizes: [50, 50] })).toBeNull();
    expect(parsePaneLayout('pane')).toBeNull();
    // Two splits sharing an id would resize together, so the tree is rejected.
    const column = (id: string, a: string, b: string) => ({ type: 'split', id, orientation: 'vertical', children: [paneLeaf(a), paneLeaf(b)], sizes: [50, 50] });
    expect(parsePaneLayout({ type: 'split', id: 'root', orientation: 'horizontal', children: [column('s', 'a', 'b'), column('s', 'c', 'd')], sizes: [50, 50] })).toBeNull();
  });

  it.each(['flat', 'nested'])('keeps a six-pane %s layout stable across repeated saves and restores', kind => {
    let layout = paneLeaf('p0');
    for (let index = 1; index < 6; index += 1) {
      layout = splitLayoutPane(layout, `p${index - 1}`, `p${index}`, kind === 'nested' && index % 2 === 0 ? 'down' : 'right');
      splitSizes(layout).forEach(expectUsableSizes);
    }
    const ids = layoutPaneIds(layout);
    const original = splitSizes(layout);
    for (let round = 0; round < 10; round += 1) {
      layout = parsePaneLayout(JSON.parse(JSON.stringify(layout)))!;
      expect(layoutPaneIds(layout)).toEqual(ids);
      const restored = splitSizes(layout);
      expect(restored).toHaveLength(original.length);
      restored.forEach((sizes, split) => {
        expectUsableSizes(sizes);
        sizes.forEach((size, index) => expect(size).toBeCloseTo(original[split][index], 10));
      });
    }
  });
});
