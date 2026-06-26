import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentSummary, FolderPathSummary, UploadNoteImageResult } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';

import {
  buildMetadataInput,
  cleanTag,
  createInitialInspectorState,
  escapeAltText,
  getDirtyState,
  getFolderOptions,
  useNoteInspectorForm,
} from './useNoteInspectorForm';

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastMocks.error,
    info: toastMocks.info,
    success: toastMocks.success,
  },
}));

function folderPath(overrides: Partial<FolderPathSummary> = {}): FolderPathSummary {
  return {
    clientId: null,
    color: null,
    icon: null,
    id: 'folder-a',
    name: 'Folder A',
    parentId: null,
    ...overrides,
  };
}

function documentSummary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: '# Hello',
    createdAtMillis: null,
    description: 'Old description',
    folderPaths: [],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-1',
    tags: ['old'],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Hello',
    titleUpdatedAtMillis: null,
    updatedAtMillis: null,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

describe('note inspector form helpers', () => {
  it('builds metadata payload with only changed fields', () => {
    const document = documentSummary({
      folderPaths: [folderPath({ id: 'folder-a' })],
      permalink: 'old-slug',
    });
    const state = {
      ...createInitialInspectorState(document),
      description: 'New description',
      parentFolderId: 'folder-b',
      permalink: ' new-slug ',
      readPermission: 'guest' as const,
      tags: ['old', 'new'],
      writePermission: 'signed_in' as const,
    };

    expect(getDirtyState(state, document)).toEqual({
      description: true,
      location: true,
      metadata: true,
      permalink: true,
      permissions: true,
      tags: true,
    });
    expect(buildMetadataInput(state, document)).toEqual({
      description: 'New description',
      parentFolderId: 'folder-b',
      permalink: 'new-slug',
      readPermission: 'guest',
      tags: ['old', 'new'],
      writePermission: 'signed_in',
    });
  });

  it('cleans tags and image alt text without touching UI state', () => {
    expect(cleanTag('  #design  ')).toBe('design');
    expect(cleanTag('   ')).toBe('');
    expect(escapeAltText('diagram[final].png')).toBe('diagramfinal');
    expect(escapeAltText('[].png')).toBe('image');
  });

  it('creates nested folder labels from the folder tree', () => {
    const tree = buildHackmdFolderTree([], [
      { clientId: null, color: null, icon: null, id: 'parent', name: 'Parent', parentId: null },
      { clientId: null, color: null, icon: null, id: 'child', name: 'Child', parentId: 'parent' },
    ]);

    expect(getFolderOptions(tree)).toEqual([
      { id: 'parent', label: 'Parent' },
      { id: 'child', label: 'Parent / Child' },
    ]);
  });
});

describe('useNoteInspectorForm', () => {
  beforeEach(() => {
    toastMocks.error.mockReset();
    toastMocks.info.mockReset();
    toastMocks.success.mockReset();
  });

  it('trims new tags and ignores duplicate tags', () => {
    const document = documentSummary();
    const actions = {
      onCopyLink: vi.fn(),
      onInsertMarkdown: vi.fn(),
      onSaveMetadata: vi.fn(),
      onUploadImage: vi.fn(async () => ({ link: 'https://assets.example/image.png' }) satisfies UploadNoteImageResult),
    };
    const { result } = renderHook(() => useNoteInspectorForm({
      actions,
      document,
      folderTree: buildHackmdFolderTree([]),
    }));

    act(() => result.current.actions.addTag(' #new '));
    expect(result.current.state.tags).toEqual(['old', 'new']);

    act(() => result.current.actions.addTag('OLD'));
    expect(result.current.state.tags).toEqual(['old', 'new']);
    expect(toastMocks.info).toHaveBeenCalledWith('Tag already exists.');
  });
});
