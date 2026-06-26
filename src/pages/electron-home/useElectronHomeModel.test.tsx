import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FolderSummary, NoteSummary, TeamSummary } from '@/lib/electron-api';
import { ROOT_FOLDER_ORDER_KEY, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';
import { useElectronHomeModel } from './useElectronHomeModel';

function folder(input: Partial<FolderSummary> & Pick<FolderSummary, 'id' | 'name'>): FolderSummary {
  return {
    clientId: input.clientId ?? null,
    color: input.color ?? null,
    createdAtMillis: input.createdAtMillis ?? null,
    description: input.description ?? null,
    icon: input.icon ?? null,
    id: input.id,
    name: input.name,
    parentId: input.parentId ?? null,
    updatedAtMillis: input.updatedAtMillis ?? null,
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

function team(input: Partial<TeamSummary> & Pick<TeamSummary, 'path' | 'name'>): TeamSummary {
  return {
    createdAtMillis: input.createdAtMillis ?? null,
    description: input.description ?? null,
    id: input.id ?? input.path,
    logo: input.logo ?? null,
    name: input.name,
    ownerId: input.ownerId ?? null,
    path: input.path,
    upgraded: input.upgraded ?? false,
    visibility: input.visibility ?? 'private',
  };
}

describe('useElectronHomeModel', () => {
  it('resolves team display labels from the teams list', () => {
    const scope: WorkspaceScope = { type: 'team', label: 'design', teamPath: 'design' };
    const { result } = renderHook(() => useElectronHomeModel({
      currentFolders: [],
      currentNotes: [],
      scope,
      selectedFolderId: null,
      syncOpenNoteSummaries: vi.fn(),
      teams: [team({ name: 'Design Team', path: 'design' })],
    }));

    expect(result.current.displayScope).toEqual({
      type: 'team',
      label: 'Design Team',
      teamPath: 'design',
    });
  });

  it('builds the folder tree and syncs open note summaries', async () => {
    const projectFolder = folder({ id: 'project', name: 'Project' });
    const notes = [
      note({ folderPaths: [projectFolder], id: 'note-a', title: 'Alpha' }),
      note({ id: 'note-b', title: 'Loose' }),
    ];
    const syncOpenNoteSummaries = vi.fn();
    const { result } = renderHook(() => useElectronHomeModel({
      currentFolderOrder: { [ROOT_FOLDER_ORDER_KEY]: ['project'] },
      currentFolders: [projectFolder],
      currentNotes: notes,
      scope: { type: 'personal', label: 'My Workspace' },
      selectedFolderId: 'project',
      syncOpenNoteSummaries,
      teams: [],
    }));

    expect(result.current.folderTree.roots[0]?.id).toBe('project');
    expect(result.current.folderTree.nodesById.get('project')?.notes[0]?.note.id).toBe('note-a');
    expect(result.current.folderTree.unfiled.notes[0]?.note.id).toBe('note-b');
    expect(result.current.selectedParentFolderIdForMutation).toBe('project');
    await waitFor(() => expect(syncOpenNoteSummaries).toHaveBeenCalledWith(notes));
  });

  it('does not use the synthetic root as a mutation parent folder', () => {
    const { result } = renderHook(() => useElectronHomeModel({
      currentFolders: [],
      currentNotes: [],
      scope: { type: 'personal', label: 'My Workspace' },
      selectedFolderId: UNFILED_FOLDER_ID,
      syncOpenNoteSummaries: vi.fn(),
      teams: [],
    }));

    expect(result.current.selectedParentFolderIdForMutation).toBeUndefined();
  });
});
