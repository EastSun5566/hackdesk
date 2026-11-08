import { describe, expect, it } from 'vitest';

import type { FolderPathSummary, NoteSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import {
  buildFolderNavigatorFocusItems,
  createFolderFocusId,
  createNoteFocusId,
  findTypeaheadMatch,
  getFolderTreeFocusItems,
  normalizeCreateNoteFolderId,
  WORKSPACE_ROOT_FOCUS_ID,
} from './folder-tree-focus';

function folder(input: Partial<FolderPathSummary> & Pick<FolderPathSummary, 'id' | 'name'>): FolderPathSummary {
  return {
    clientId: input.clientId ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    id: input.id,
    name: input.name,
    parentId: input.parentId ?? null,
  };
}

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: input.content ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    description: input.description ?? '',
    folderPaths: input.folderPaths ?? [],
    id: input.id,
    lastChangeUser: input.lastChangeUser ?? null,
    permalink: input.permalink ?? null,
    publishLink: input.publishLink ?? `https://hackmd.io/${input.id}`,
    publishedAtMillis: input.publishedAtMillis ?? null,
    publishType: input.publishType ?? 'edit',
    readPermission: input.readPermission ?? 'owner',
    shortId: input.shortId ?? input.id,
    tags: input.tags ?? [],
    tagsUpdatedAtMillis: input.tagsUpdatedAtMillis ?? null,
    teamPath: input.teamPath ?? null,
    title: input.title,
    titleUpdatedAtMillis: input.titleUpdatedAtMillis ?? null,
    updatedAtMillis: input.updatedAtMillis ?? null,
    userPath: input.userPath ?? null,
    writePermission: input.writePermission ?? 'owner',
  };
}

function createTree() {
  const projects = folder({ id: 'projects', name: 'Projects' });
  const design = folder({ id: 'design', name: 'Design', parentId: 'projects' });
  const notes = [
    note({ folderPaths: [projects], id: 'planning', title: 'Planning' }),
    note({ folderPaths: [projects, design], id: 'design-note', title: 'Design Note' }),
    note({ id: 'daily', title: 'Daily Log' }),
  ];

  return buildHackmdFolderTree(notes, [projects, design]);
}

describe('folder tree focus model', () => {
  it('builds visible focus items in tree order', () => {
    expect(getFolderTreeFocusItems(createTree(), new Set()).map((item) => item.id)).toEqual([
      createFolderFocusId('projects'),
      createFolderFocusId('design'),
      createNoteFocusId('design-note'),
      createNoteFocusId('planning'),
      createNoteFocusId('daily'),
    ]);
  });

  it('skips collapsed children without expanding folders', () => {
    expect(getFolderTreeFocusItems(createTree(), new Set(['projects'])).map((item) => item.id)).toEqual([
      createFolderFocusId('projects'),
      createNoteFocusId('daily'),
    ]);
  });

  it('finds typeahead matches after the current row and wraps around', () => {
    const items = getFolderTreeFocusItems(createTree(), new Set());

    expect(findTypeaheadMatch(items, 'd', 0)?.id).toBe(createFolderFocusId('design'));
    expect(findTypeaheadMatch(items, 'p', 4)?.id).toBe(createFolderFocusId('projects'));
  });

  it('normalizes root folder ids for create-note commands', () => {
    expect(normalizeCreateNoteFolderId(UNFILED_FOLDER_ID)).toBeNull();
    expect(normalizeCreateNoteFolderId('projects')).toBe('projects');
  });

  it('puts the workspace root before the tree for keyboard navigation', () => {
    const ids = buildFolderNavigatorFocusItems({
      tree: createTree(),
      collapsedFolderIds: new Set(),
      showRoot: true,
      rootSectionExpanded: true,
      rootLabel: 'My Notes',
    }).map((item) => item.id);
    expect(ids[0]).toBe(WORKSPACE_ROOT_FOCUS_ID);
    expect(ids).toContain(createFolderFocusId('projects'));
  });

  it('omits tree items while the root section is collapsed', () => {
    const ids = buildFolderNavigatorFocusItems({
      tree: createTree(),
      collapsedFolderIds: new Set(),
      showRoot: true,
      rootSectionExpanded: false,
      rootLabel: 'My Notes',
    }).map((item) => item.id);
    expect(ids).toEqual([WORKSPACE_ROOT_FOCUS_ID]);
  });
});
