import type { FolderOrder } from './electron-api';
import type { FolderTree, FolderTreeNode } from './hackmd-folders';
import { ROOT_FOLDER_ORDER_KEY } from './hackmd-folders';

export const ROOT_FOLDER_DROP_ID = '__hackdesk_root_folder_drop__';
const FOLDER_DND_INDENT_WIDTH = 20;

export type FlattenedFolderItem = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  ancestorIds: string[];
};

export type FolderDropProjection = {
  parentId: string | null;
  depth: number;
};

export type FolderDropOperation = {
  folderId: string;
  parentFolderId: string | null;
  order: FolderOrder;
  parentChanged: boolean;
  orderChanged: boolean;
  changed: boolean;
};

function walkFolder(
  node: FolderTreeNode,
  depth: number,
  ancestorIds: string[],
  collapsedFolderIds: Set<string>,
  includeCollapsedChildren: boolean,
  items: FlattenedFolderItem[],
) {
  items.push({
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    depth,
    ancestorIds,
  });

  if (!includeCollapsedChildren && collapsedFolderIds.has(node.id)) {
    return;
  }

  node.children.forEach((child) => {
    walkFolder(child, depth + 1, [...ancestorIds, node.id], collapsedFolderIds, includeCollapsedChildren, items);
  });
}

export function flattenFolderTree(
  tree: FolderTree,
  collapsedFolderIds = new Set<string>(),
  includeCollapsedChildren = false,
) {
  const items: FlattenedFolderItem[] = [];

  tree.roots.forEach((node) => {
    walkFolder(node, 0, [], collapsedFolderIds, includeCollapsedChildren, items);
  });

  return items;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getParentIdForDepth(items: FlattenedFolderItem[], insertIndex: number, depth: number) {
  if (depth === 0) {
    return null;
  }

  for (let index = insertIndex - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item.depth === depth - 1) {
      return item.id;
    }
  }

  return null;
}

export function getProjectedFolderDrop({
  items,
  activeId,
  overId,
  dragOffsetX,
  indentationWidth = FOLDER_DND_INDENT_WIDTH,
}: {
  items: FlattenedFolderItem[];
  activeId: string;
  overId: string;
  dragOffsetX: number;
  indentationWidth?: number;
}): FolderDropProjection | null {
  const activeItem = items.find((item) => item.id === activeId);
  if (!activeItem) {
    return null;
  }

  if (overId === ROOT_FOLDER_DROP_ID) {
    return { parentId: null, depth: 0 };
  }

  const activeIndex = items.findIndex((item) => item.id === activeId);
  const filteredItems = items.filter((item) => item.id !== activeId && !item.ancestorIds.includes(activeId));
  const overIndex = filteredItems.findIndex((item) => item.id === overId);

  if (activeIndex < 0 || overIndex < 0) {
    return null;
  }

  const previousItem = filteredItems[overIndex - 1] ?? null;
  const nextItem = filteredItems[overIndex] ?? null;
  const projectedDepth = activeItem.depth + Math.round(dragOffsetX / indentationWidth);
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  const depth = clamp(projectedDepth, minDepth, maxDepth);

  return {
    depth,
    parentId: getParentIdForDepth(filteredItems, overIndex, depth),
  };
}

function buildFolderOrderFromTree(tree: FolderTree): FolderOrder {
  const order: FolderOrder = {
    [ROOT_FOLDER_ORDER_KEY]: tree.roots.map((node) => node.id),
  };

  for (const node of tree.nodesById.values()) {
    order[node.id] = node.children.map((child) => child.id);
  }

  return order;
}

function removeFolderFromOrder(order: FolderOrder, folderId: string) {
  for (const [parentId, folderIds] of Object.entries(order)) {
    order[parentId] = folderIds.filter((candidateId) => candidateId !== folderId);
  }
}

function insertFolderIntoOrder(order: FolderOrder, parentFolderId: string | null, folderId: string, anchorId: string | null, afterAnchor: boolean) {
  const parentKey = parentFolderId ?? ROOT_FOLDER_ORDER_KEY;
  const siblings = order[parentKey] ?? [];
  const anchorIndex = anchorId ? siblings.indexOf(anchorId) : -1;
  const insertIndex = anchorIndex >= 0 ? anchorIndex + (afterAnchor ? 1 : 0) : siblings.length;

  order[parentKey] = [
    ...siblings.slice(0, insertIndex),
    folderId,
    ...siblings.slice(insertIndex),
  ];
}

function ordersEqual(left: FolderOrder, right: FolderOrder) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of keys) {
    const leftValue = left[key] ?? [];
    const rightValue = right[key] ?? [];

    if (leftValue.length !== rightValue.length || leftValue.some((item, index) => item !== rightValue[index])) {
      return false;
    }
  }

  return true;
}

export function buildFolderDropOperation({
  tree,
  visibleItems,
  activeId,
  overId,
  projection,
}: {
  tree: FolderTree;
  visibleItems: FlattenedFolderItem[];
  activeId: string;
  overId: string;
  projection: FolderDropProjection;
}): FolderDropOperation | null {
  const activeNode = tree.nodesById.get(activeId);
  if (!activeNode || projection.parentId === activeId) {
    return null;
  }

  const descendants = new Set<string>();
  const descendantStack = [...activeNode.children];
  while (descendantStack.length > 0) {
    const descendant = descendantStack.pop();
    if (!descendant) {
      continue;
    }

    descendants.add(descendant.id);
    descendantStack.push(...descendant.children);
  }
  if (projection.parentId && descendants.has(projection.parentId)) {
    return null;
  }

  const previousOrder = buildFolderOrderFromTree(tree);
  const nextOrder = structuredClone(previousOrder);
  const activeIndex = visibleItems.findIndex((item) => item.id === activeId);
  const overIndex = visibleItems.findIndex((item) => item.id === overId);
  const overItem = visibleItems.find((item) => item.id === overId);
  const afterAnchor = activeIndex >= 0 && overIndex >= 0 && activeIndex < overIndex;

  removeFolderFromOrder(nextOrder, activeId);
  insertFolderIntoOrder(
    nextOrder,
    projection.parentId,
    activeId,
    overItem?.parentId === projection.parentId ? overItem.id : null,
    afterAnchor,
  );

  const parentChanged = activeNode.parentId !== projection.parentId;
  const orderChanged = !ordersEqual(previousOrder, nextOrder);

  return {
    folderId: activeId,
    parentFolderId: projection.parentId,
    order: nextOrder,
    parentChanged,
    orderChanged,
    changed: parentChanged || orderChanged,
  };
}
