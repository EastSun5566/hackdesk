import { describe, expect, it } from 'vitest';

import {
  equalizeLayout,
  layoutPaneIds,
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
    expect(shape(resizeLayoutSplit(layout, layout.id, { a: 99, [column.id]: 1 }))).toEqual({
      row: ['a', { column: ['b', 'c'], sizes: [50, 50] }], sizes: [91, 9],
    });
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
  });
});
