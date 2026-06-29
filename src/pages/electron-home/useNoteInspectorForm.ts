import { type FormEvent, useMemo, useReducer } from 'react';
import { toast } from 'sonner';

import type {
  DocumentSummary,
  NotePermissionRole,
  UpdateNoteInput,
} from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode } from '@/lib/hackmd-folders';

import { getFolderPathLabel } from './ui';

export type FolderOption = {
  id: string;
  label: string;
};

export type InspectorFormState = {
  description: string;
  parentFolderId: string;
  permalink: string;
  readPermission: NotePermissionRole;
  tagDraft: string;
  tags: string[];
  writePermission: NotePermissionRole;
};

export type InspectorFormAction =
  | { type: 'set-description'; value: string }
  | { type: 'set-parent-folder-id'; value: string }
  | { type: 'set-permalink'; value: string }
  | { type: 'set-read-permission'; value: NotePermissionRole }
  | { type: 'set-tag-draft'; value: string }
  | { type: 'set-tags'; value: string[] }
  | { type: 'set-write-permission'; value: NotePermissionRole };

export type NoteInspectorStatus = {
  saving: boolean;
};

export type NoteInspectorActions = {
  onCopyLink: (document: DocumentSummary) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
};

export type InspectorDirtyState = {
  description: boolean;
  location: boolean;
  metadata: boolean;
  permalink: boolean;
  permissions: boolean;
  tags: boolean;
};

export function getDocumentFolderId(document: DocumentSummary) {
  return document.folderPaths.at(-1)?.id ?? '';
}

export function tagsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

export function cleanTag(value: string) {
  return value.trim().replace(/^#/, '');
}

export function getFolderOptions(tree: FolderTree) {
  const options: FolderOption[] = [];

  function walk(node: FolderTreeNode) {
    options.push({
      id: node.id,
      label: getFolderPathLabel(node.folderPath) || node.name,
    });

    node.children.forEach(walk);
  }

  tree.roots.forEach(walk);
  return options;
}

export function createInitialInspectorState(document: DocumentSummary): InspectorFormState {
  return {
    description: document.description,
    parentFolderId: getDocumentFolderId(document),
    permalink: document.permalink ?? '',
    readPermission: document.readPermission,
    tagDraft: '',
    tags: [...document.tags],
    writePermission: document.writePermission,
  };
}

export function inspectorFormReducer(state: InspectorFormState, action: InspectorFormAction): InspectorFormState {
  switch (action.type) {
  case 'set-description':
    return { ...state, description: action.value };
  case 'set-parent-folder-id':
    return { ...state, parentFolderId: action.value };
  case 'set-permalink':
    return { ...state, permalink: action.value };
  case 'set-read-permission':
    return { ...state, readPermission: action.value };
  case 'set-tag-draft':
    return { ...state, tagDraft: action.value };
  case 'set-tags':
    return { ...state, tags: action.value, tagDraft: '' };
  case 'set-write-permission':
    return { ...state, writePermission: action.value };
  default:
    return state;
  }
}

export function getDirtyState(state: InspectorFormState, document: DocumentSummary): InspectorDirtyState {
  const currentFolderId = getDocumentFolderId(document);
  const description = state.description !== document.description;
  const tags = !tagsEqual(state.tags, document.tags);
  const permalink = state.permalink !== (document.permalink ?? '');
  const location = state.parentFolderId !== currentFolderId;
  const permissions =
    state.readPermission !== document.readPermission
    || state.writePermission !== document.writePermission;

  return {
    description,
    location,
    metadata: description || tags || permalink || location || permissions,
    permalink,
    permissions,
    tags,
  };
}

export function buildMetadataInput(state: InspectorFormState, document: DocumentSummary): UpdateNoteInput {
  const input: UpdateNoteInput = {};

  if (state.description !== document.description) {
    input.description = state.description;
  }
  if (!tagsEqual(state.tags, document.tags)) {
    input.tags = state.tags;
  }
  if (state.permalink !== (document.permalink ?? '')) {
    input.permalink = state.permalink.trim();
  }
  if (state.readPermission !== document.readPermission) {
    input.readPermission = state.readPermission;
  }
  if (state.writePermission !== document.writePermission) {
    input.writePermission = state.writePermission;
  }
  if (state.parentFolderId !== getDocumentFolderId(document)) {
    input.parentFolderId = state.parentFolderId || null;
  }

  return input;
}

export function useNoteInspectorForm({
  actions,
  document,
  folderTree,
}: {
  actions: NoteInspectorActions;
  document: DocumentSummary;
  folderTree: FolderTree;
}) {
  const folderOptions = useMemo(() => getFolderOptions(folderTree), [folderTree]);
  const [state, dispatch] = useReducer(inspectorFormReducer, document, createInitialInspectorState);
  const dirty = getDirtyState(state, document);

  const addTag = (value: string) => {
    const nextTag = cleanTag(value);
    if (!nextTag) {
      return;
    }

    if (state.tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
      toast.info('Tag already exists.');
      dispatch({ type: 'set-tag-draft', value: '' });
      return;
    }

    dispatch({ type: 'set-tags', value: [...state.tags, nextTag] });
  };

  const removeTag = (tagToRemove: string) => {
    dispatch({
      type: 'set-tags',
      value: state.tags.filter((tag) => tag !== tagToRemove),
    });
  };

  const submitMetadata = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    actions.onSaveMetadata(document, buildMetadataInput(state, document));
  };

  return {
    actions: {
      addTag,
      removeTag,
    },
    dirty,
    dispatch,
    folderOptions,
    state,
    submit: {
      metadata: submitMetadata,
    },
  };
}
