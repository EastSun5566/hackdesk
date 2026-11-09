import { describe, expect, it } from 'vitest';

import {
  buildFolderDropOperation,
  flattenFolderTree,
  getFolderDropPlacement,
  getPlacedFolderDrop,
  getProjectedFolderDrop,
  ROOT_FOLDER_DROP_ID,
} from './hackmd-folder-dnd';
import { buildHackmdFolderTree } from './hackmd-folders';

const folders = [
  { id: 'a', name: 'A', icon: null, color: null, parentId: null, clientId: null },
  { id: 'b', name: 'B', icon: null, color: null, parentId: null, clientId: null },
  { id: 'c', name: 'C', icon: null, color: null, parentId: 'a', clientId: null },
];

describe('hackmd folder dnd helpers', () => {
  it('reorders folders within the same parent', () => {
    const tree = buildHackmdFolderTree([], folders);
    const visibleItems = flattenFolderTree(tree);
    const projection = getProjectedFolderDrop({
      items: visibleItems,
      activeId: 'a',
      overId: 'b',
      dragOffsetX: 0,
    });

    expect(projection).toEqual({ parentId: null, depth: 0 });
    expect(buildFolderDropOperation({
      tree,
      visibleItems,
      activeId: 'a',
      overId: 'b',
      projection: projection!,
    })).toMatchObject({
      folderId: 'a',
      parentFolderId: null,
      parentChanged: false,
      orderChanged: true,
      changed: true,
      order: {
        root: ['b', 'a'],
        a: ['c'],
      },
    });
  });

  it('projects a folder under the previous visible folder when dragged right', () => {
    const tree = buildHackmdFolderTree([], folders);
    const visibleItems = flattenFolderTree(tree);
    const projection = getProjectedFolderDrop({
      items: visibleItems,
      activeId: 'b',
      overId: 'c',
      dragOffsetX: 20,
    });

    expect(projection).toEqual({ parentId: 'a', depth: 1 });
    expect(buildFolderDropOperation({
      tree,
      visibleItems,
      activeId: 'b',
      overId: 'c',
      projection: projection!,
    })).toMatchObject({
      folderId: 'b',
      parentFolderId: 'a',
      parentChanged: true,
      orderChanged: true,
      changed: true,
      order: {
        root: ['a'],
        a: ['b', 'c'],
      },
    });
  });

  it('moves folders back to root through the root drop target', () => {
    const tree = buildHackmdFolderTree([], folders);
    const visibleItems = flattenFolderTree(tree);
    const projection = getProjectedFolderDrop({
      items: visibleItems,
      activeId: 'c',
      overId: ROOT_FOLDER_DROP_ID,
      dragOffsetX: 0,
    });

    expect(projection).toEqual({ parentId: null, depth: 0 });

    expect(buildFolderDropOperation({
      tree,
      visibleItems,
      activeId: 'c',
      overId: ROOT_FOLDER_DROP_ID,
      projection: projection!,
    })).toMatchObject({
      folderId: 'c',
      parentFolderId: null,
      parentChanged: true,
      orderChanged: true,
      changed: true,
      order: {
        root: ['a', 'b', 'c'],
        a: [],
      },
    });
  });

  it('prevents dropping a folder into its own descendants', () => {
    const tree = buildHackmdFolderTree([], folders);
    const visibleItems = flattenFolderTree(tree);

    expect(getProjectedFolderDrop({
      items: visibleItems,
      activeId: 'a',
      overId: 'c',
      dragOffsetX: 20,
    })).toBeNull();
  });

  it('reads a pointer drop on a folder row as before, inside or after by where it lands', () => {
    const row = { top: 100, height: 32 };
    expect(getFolderDropPlacement({ ...row, pointerY: 104, showsChildrenBelow: false })).toBe('before');
    expect(getFolderDropPlacement({ ...row, pointerY: 116, showsChildrenBelow: false })).toBe('inside');
    expect(getFolderDropPlacement({ ...row, pointerY: 129, showsChildrenBelow: false })).toBe('after');
    // An open folder's contents sit right below it, so its bottom edge drops inside.
    expect(getFolderDropPlacement({ ...row, pointerY: 129, showsChildrenBelow: true })).toBe('inside');
  });

  it('moves a folder inside another one dropped on its middle', () => {
    const tree = buildHackmdFolderTree([], folders);
    const visibleItems = flattenFolderTree(tree);
    const projection = getPlacedFolderDrop({ items: visibleItems, activeId: 'b', overId: 'a', placement: 'inside' });

    expect(projection).toEqual({ parentId: 'a', depth: 1 });
    expect(buildFolderDropOperation({
      tree,
      visibleItems,
      activeId: 'b',
      overId: 'a',
      projection: projection!,
      placement: 'inside',
    })).toMatchObject({
      folderId: 'b',
      parentFolderId: 'a',
      parentChanged: true,
      changed: true,
      order: { root: ['a'], a: ['c', 'b'] },
    });
  });

  it('places a folder before or after another by the edge it is dropped on', () => {
    const tree = buildHackmdFolderTree([], folders);
    const visibleItems = flattenFolderTree(tree);
    const before = getPlacedFolderDrop({ items: visibleItems, activeId: 'c', overId: 'b', placement: 'before' });
    expect(before).toEqual({ parentId: null, depth: 0 });
    expect(buildFolderDropOperation({
      tree, visibleItems, activeId: 'c', overId: 'b', projection: before!, placement: 'before',
    })).toMatchObject({ parentFolderId: null, order: { root: ['a', 'c', 'b'], a: [] } });

    const after = getPlacedFolderDrop({ items: visibleItems, activeId: 'b', overId: 'a', placement: 'after' });
    expect(buildFolderDropOperation({
      tree, visibleItems, activeId: 'b', overId: 'a', projection: after!, placement: 'after',
    })).toMatchObject({ changed: false });
  });

  it('refuses pointer drops on the folder itself or inside its own subfolders', () => {
    const tree = buildHackmdFolderTree([], folders);
    const visibleItems = flattenFolderTree(tree);
    expect(getPlacedFolderDrop({ items: visibleItems, activeId: 'a', overId: 'a', placement: 'inside' })).toBeNull();
    expect(getPlacedFolderDrop({ items: visibleItems, activeId: 'a', overId: 'c', placement: 'inside' })).toBeNull();
    expect(getPlacedFolderDrop({ items: visibleItems, activeId: 'a', overId: 'c', placement: 'before' })).toBeNull();
  });
});
