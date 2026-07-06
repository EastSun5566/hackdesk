import { describe, expect, it } from 'vitest';

import { buildFolderDropOperation, flattenFolderTree, getProjectedFolderDrop, ROOT_FOLDER_DROP_ID } from './hackmd-folder-dnd';
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
});
