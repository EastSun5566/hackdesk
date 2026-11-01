/**
 * The editor area's layout: a tree of splits whose leaves are panes. Panes keep their tabs in the
 * note workspace; this tree only holds how they are arranged and sized. Sizes are percentages of
 * their split, in child order.
 */
export type PaneSplitOrientation = 'horizontal' | 'vertical';

export type PaneLayoutNode =
  | { type: 'pane'; paneId: string }
  | { type: 'split'; id: string; orientation: PaneSplitOrientation; children: PaneLayoutNode[]; sizes: number[] };

export type PaneDirection = 'left' | 'right' | 'up' | 'down';

export type PaneRect = { paneId: string; x: number; y: number; width: number; height: number };

const MIN_SIZE = 10;
const EPSILON = 1e-6;

let nextSplitId = 0;

function createSplitId() {
  nextSplitId += 1;
  return `note-split-${Date.now()}-${nextSplitId}`;
}

export function paneLeaf(paneId: string): PaneLayoutNode {
  return { type: 'pane', paneId };
}

/** Panes in reading order: left to right, top to bottom. */
export function layoutPaneIds(node: PaneLayoutNode): string[] {
  return node.type === 'pane' ? [node.paneId] : node.children.flatMap(layoutPaneIds);
}

/** The id a child is known by in its split, which is also its panel id. */
export function layoutNodeId(node: PaneLayoutNode) {
  return node.type === 'pane' ? node.paneId : node.id;
}

function equalSizes(count: number) {
  return Array.from({ length: count }, () => 100 / count);
}

/** Keeps every child at least MIN_SIZE and the total at 100; anything unusable becomes equal. */
export function normalizeSizes(sizes: readonly number[], count: number) {
  if (count <= 1) return [100];
  if (sizes.length !== count || sizes.some(size => !Number.isFinite(size) || size <= 0)) return equalSizes(count);
  const clamped = sizes.map(size => Math.max(size, MIN_SIZE));
  const total = clamped.reduce((sum, size) => sum + size, 0);
  return clamped.map(size => (size / total) * 100);
}

function makeSplit(orientation: PaneSplitOrientation, children: PaneLayoutNode[], sizes: number[], id = createSplitId()): PaneLayoutNode {
  // A child split running the same way is folded in, so the tree stays as flat as the layout.
  const flatChildren: PaneLayoutNode[] = [];
  const flatSizes: number[] = [];
  children.forEach((child, index) => {
    if (child.type === 'split' && child.orientation === orientation) {
      child.sizes.forEach((size, childIndex) => {
        flatChildren.push(child.children[childIndex]);
        flatSizes.push((size / 100) * sizes[index]);
      });
    } else {
      flatChildren.push(child);
      flatSizes.push(sizes[index]);
    }
  });
  if (flatChildren.length === 1) return flatChildren[0];
  return { type: 'split', id, orientation, children: flatChildren, sizes: normalizeSizes(flatSizes, flatChildren.length) };
}

function orientationOf(direction: PaneDirection): PaneSplitOrientation {
  return direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
}

/**
 * Places a new pane beside an existing one. Beside a pane that already sits in a split running the
 * same way, the new pane joins that split and takes half of its neighbour's space; otherwise the
 * pane and the new one share a new split.
 */
export function splitLayoutPane(node: PaneLayoutNode, paneId: string, newPaneId: string, direction: PaneDirection): PaneLayoutNode {
  const orientation = orientationOf(direction);
  const before = direction === 'left' || direction === 'up';
  const visit = (current: PaneLayoutNode): PaneLayoutNode => {
    if (current.type === 'pane') {
      if (current.paneId !== paneId) return current;
      const pair = before ? [paneLeaf(newPaneId), current] : [current, paneLeaf(newPaneId)];
      return makeSplit(orientation, pair, [50, 50]);
    }
    const index = current.children.findIndex(child => child.type === 'pane' && child.paneId === paneId);
    if (index >= 0 && current.orientation === orientation) {
      const half = current.sizes[index] / 2;
      const insertAt = before ? index : index + 1;
      const children = [...current.children];
      const sizes = [...current.sizes];
      children.splice(insertAt, 0, paneLeaf(newPaneId));
      sizes.splice(index, 1, half);
      sizes.splice(insertAt, 0, half);
      return { ...current, children, sizes: normalizeSizes(sizes, children.length) };
    }
    return makeSplit(current.orientation, current.children.map(visit), current.sizes, current.id);
  };
  return visit(node);
}

/** Removes a pane; its space goes to the rest of its split, and a split left with one child gives way to it. */
export function removeLayoutPane(node: PaneLayoutNode, paneId: string): PaneLayoutNode | null {
  if (node.type === 'pane') return node.paneId === paneId ? null : node;
  const kept: PaneLayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, index) => {
    const next = removeLayoutPane(child, paneId);
    if (next) {
      kept.push(next);
      sizes.push(node.sizes[index]);
    }
  });
  if (kept.length === 0) return null;
  return makeSplit(node.orientation, kept, sizes, node.id);
}

/** Applies sizes reported by a split's panels, keyed by each child's id. */
export function resizeLayoutSplit(node: PaneLayoutNode, splitId: string, sizesById: Record<string, number>): PaneLayoutNode {
  if (node.type === 'pane') return node;
  if (node.id === splitId) {
    const sizes = node.children.map((child, index) => sizesById[layoutNodeId(child)] ?? node.sizes[index]);
    return { ...node, sizes: normalizeSizes(sizes, node.children.length) };
  }
  return { ...node, children: node.children.map(child => resizeLayoutSplit(child, splitId, sizesById)) };
}

export function equalizeLayout(node: PaneLayoutNode): PaneLayoutNode {
  if (node.type === 'pane') return node;
  return { ...node, children: node.children.map(equalizeLayout), sizes: equalSizes(node.children.length) };
}

/**
 * Makes the tree hold exactly the given panes: leaves for panes that are gone are removed, and
 * panes the tree does not know join the end of the top split.
 */
export function reconcileLayout(node: PaneLayoutNode | null, paneIds: readonly string[]): PaneLayoutNode {
  const wanted = new Set(paneIds);
  let layout = node;
  for (const paneId of layout ? layoutPaneIds(layout) : []) {
    if (!wanted.has(paneId) && layout) layout = removeLayoutPane(layout, paneId);
  }
  const placed = new Set(layout ? layoutPaneIds(layout) : []);
  for (const paneId of paneIds) {
    if (placed.has(paneId)) continue;
    layout = layout ? splitLayoutPane(layout, layoutPaneIds(layout).at(-1)!, paneId, 'right') : paneLeaf(paneId);
    placed.add(paneId);
  }
  return layout ?? paneLeaf(paneIds[0] ?? 'note-pane-primary');
}

/** Reads a saved tree, or returns null when it is not one; each pane and each split appears only once. */
export function parsePaneLayout(value: unknown): PaneLayoutNode | null {
  const seen = new Set<string>();
  const seenSplits = new Set<string>();
  const parse = (input: unknown, depth: number): PaneLayoutNode | null => {
    if (!input || typeof input !== 'object' || depth > 8) return null;
    const candidate = input as Record<string, unknown>;
    if (candidate.type === 'pane') {
      if (typeof candidate.paneId !== 'string' || seen.has(candidate.paneId)) return null;
      seen.add(candidate.paneId);
      return paneLeaf(candidate.paneId);
    }
    if (candidate.type !== 'split' || typeof candidate.id !== 'string' || seenSplits.has(candidate.id) || !Array.isArray(candidate.children)
      || (candidate.orientation !== 'horizontal' && candidate.orientation !== 'vertical')) return null;
    seenSplits.add(candidate.id);
    const children = candidate.children.map(child => parse(child, depth + 1));
    if (children.length === 0 || children.some(child => !child)) return null;
    const sizes = Array.isArray(candidate.sizes) ? candidate.sizes.map(Number) : [];
    return makeSplit(candidate.orientation, children as PaneLayoutNode[], normalizeSizes(sizes, children.length), candidate.id);
  };
  return parse(value, 0);
}

/** Each pane's rectangle within a unit square. */
export function paneRects(node: PaneLayoutNode, x = 0, y = 0, width = 1, height = 1): PaneRect[] {
  if (node.type === 'pane') return [{ paneId: node.paneId, x, y, width, height }];
  let offset = 0;
  return node.children.flatMap((child, index) => {
    const share = node.sizes[index] / 100;
    const rects = node.orientation === 'horizontal'
      ? paneRects(child, x + offset * width, y, width * share, height)
      : paneRects(child, x, y + offset * height, width, height * share);
    offset += share;
    return rects;
  });
}

/** The nearest pane in a direction that overlaps the current one across that direction. */
export function paneInDirection(node: PaneLayoutNode, fromPaneId: string, direction: PaneDirection): string | null {
  const rects = paneRects(node);
  const from = rects.find(rect => rect.paneId === fromPaneId);
  if (!from) return null;
  const horizontal = direction === 'left' || direction === 'right';
  const candidates = rects.flatMap((rect) => {
    if (rect.paneId === fromPaneId) return [];
    const gap = direction === 'right' ? rect.x - (from.x + from.width)
      : direction === 'left' ? from.x - (rect.x + rect.width)
        : direction === 'down' ? rect.y - (from.y + from.height)
          : from.y - (rect.y + rect.height);
    const overlap = horizontal
      ? Math.min(from.y + from.height, rect.y + rect.height) - Math.max(from.y, rect.y)
      : Math.min(from.x + from.width, rect.x + rect.width) - Math.max(from.x, rect.x);
    return gap > -EPSILON && overlap > EPSILON ? [{ paneId: rect.paneId, gap, overlap }] : [];
  });
  candidates.sort((left, right) => left.gap - right.gap || right.overlap - left.overlap);
  return candidates[0]?.paneId ?? null;
}
