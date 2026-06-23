import { Copy, ImagePlus, Loader2, Save, X } from 'lucide-react';
import { type FormEvent, useId, useMemo, useReducer } from 'react';
import { toast } from 'sonner';

import type {
  DocumentSummary,
  NotePermissionRole,
  UpdateNoteInput,
  UploadNoteImageInput,
  UploadNoteImageResult,
} from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

import { CollapsibleSection, PanelHeader, ToolbarIconButton } from './interaction-primitives';
import {
  FOCUS_RING_CLASS,
  TEXT_INPUT_CLASS,
  getFolderPathLabel,
} from './ui';

type FolderOption = {
  id: string;
  label: string;
};

type InspectorFormState = {
  description: string;
  imageFile: File | null;
  parentFolderId: string;
  permalink: string;
  readPermission: NotePermissionRole;
  tagDraft: string;
  tags: string[];
  writePermission: NotePermissionRole;
};

type InspectorFormAction =
  | { type: 'set-description'; value: string }
  | { type: 'set-image-file'; value: File | null }
  | { type: 'set-parent-folder-id'; value: string }
  | { type: 'set-permalink'; value: string }
  | { type: 'set-read-permission'; value: NotePermissionRole }
  | { type: 'set-tag-draft'; value: string }
  | { type: 'set-tags'; value: string[] }
  | { type: 'set-write-permission'; value: NotePermissionRole };

type NoteInspectorStatus = {
  saving: boolean;
  uploading: boolean;
};

type NoteInspectorActions = {
  onCopyLink: (document: DocumentSummary) => void;
  onInsertMarkdown: (markdown: string) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onUploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
};

type NoteInspectorProps = {
  actions: NoteInspectorActions;
  document: DocumentSummary;
  folderTree: FolderTree;
  status: NoteInspectorStatus;
};

type InspectorDirtyState = {
  description: boolean;
  location: boolean;
  metadata: boolean;
  permalink: boolean;
  permissions: boolean;
  tags: boolean;
};

type MetadataSectionIds = {
  descriptionId: string;
  permalinkId: string;
  tagsId: string;
};

type LocationSectionIds = {
  folderId: string;
};

type PermissionsSectionIds = {
  readPermissionId: string;
  writePermissionId: string;
};

type ImagesSectionIds = {
  imageId: string;
};

const INSPECTOR_INPUT_CLASS = TEXT_INPUT_CLASS
  .replace('h-10', 'h-9')
  .replace('px-3', 'px-2.5');
const INSPECTOR_TEXTAREA_CLASS = cn(INSPECTOR_INPUT_CLASS, 'min-h-16 py-2');

function getDocumentFolderId(document: DocumentSummary) {
  return document.folderPaths.at(-1)?.id ?? '';
}

function tagsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function cleanTag(value: string) {
  return value.trim().replace(/^#/, '');
}

function getFolderOptions(tree: FolderTree) {
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

function escapeAltText(value: string) {
  return value.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '').trim() || 'image';
}

function createInitialState(document: DocumentSummary): InspectorFormState {
  return {
    description: document.description,
    imageFile: null,
    parentFolderId: getDocumentFolderId(document),
    permalink: document.permalink ?? '',
    readPermission: document.readPermission,
    tagDraft: '',
    tags: [...document.tags],
    writePermission: document.writePermission,
  };
}

function inspectorFormReducer(state: InspectorFormState, action: InspectorFormAction): InspectorFormState {
  switch (action.type) {
  case 'set-description':
    return { ...state, description: action.value };
  case 'set-image-file':
    return { ...state, imageFile: action.value };
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

function getDirtyState(state: InspectorFormState, document: DocumentSummary): InspectorDirtyState {
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

export function NoteInspector(props: NoteInspectorProps) {
  return <NoteInspectorPanel key={props.document.id} {...props} />;
}

function NoteInspectorPanel({
  actions,
  document,
  folderTree,
  status,
}: NoteInspectorProps) {
  const metadataIds = {
    descriptionId: useId(),
    permalinkId: useId(),
    tagsId: useId(),
  };
  const locationIds = {
    folderId: useId(),
  };
  const permissionsIds = {
    readPermissionId: useId(),
    writePermissionId: useId(),
  };
  const imagesIds = {
    imageId: useId(),
  };
  const folderOptions = useMemo(() => getFolderOptions(folderTree), [folderTree]);
  const [formState, dispatch] = useReducer(inspectorFormReducer, document, createInitialState);
  const dirty = getDirtyState(formState, document);

  const addTag = (value: string) => {
    const nextTag = cleanTag(value);
    if (!nextTag) {
      return;
    }

    if (formState.tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
      toast.info('Tag already exists.');
      dispatch({ type: 'set-tag-draft', value: '' });
      return;
    }

    dispatch({ type: 'set-tags', value: [...formState.tags, nextTag] });
  };

  const removeTag = (tagToRemove: string) => {
    dispatch({
      type: 'set-tags',
      value: formState.tags.filter((tag) => tag !== tagToRemove),
    });
  };

  const handleMetadataSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input: UpdateNoteInput = {};

    if (formState.description !== document.description) {
      input.description = formState.description;
    }
    if (!tagsEqual(formState.tags, document.tags)) {
      input.tags = formState.tags;
    }
    if (formState.permalink !== (document.permalink ?? '')) {
      input.permalink = formState.permalink.trim();
    }
    if (formState.readPermission !== document.readPermission) {
      input.readPermission = formState.readPermission;
    }
    if (formState.writePermission !== document.writePermission) {
      input.writePermission = formState.writePermission;
    }
    if (formState.parentFolderId !== getDocumentFolderId(document)) {
      input.parentFolderId = formState.parentFolderId || null;
    }

    actions.onSaveMetadata(document, input);
  };

  const handleImageUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.imageFile) {
      return;
    }

    try {
      const bytes = await formState.imageFile.arrayBuffer();
      const result = await actions.onUploadImage(document, {
        fileName: formState.imageFile.name,
        mimeType: formState.imageFile.type || 'application/octet-stream',
        bytes,
      });

      actions.onInsertMarkdown(`\n![${escapeAltText(formState.imageFile.name)}](${result.link})\n`);
      dispatch({ type: 'set-image-file', value: null });
      toast.success('Image uploaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload image.');
    }
  };

  return (
    <aside
      data-hackdesk-focus="inspector"
      tabIndex={-1}
      className="flex h-full w-80 flex-col bg-background-muted outline-none"
    >
      <InspectorHeader
        document={document}
        onCopyLink={actions.onCopyLink}
      />

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <form onSubmit={handleMetadataSubmit}>
          <MetadataSection
            dirty={dirty}
            dispatch={dispatch}
            ids={metadataIds}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            state={formState}
          />
          <LocationSection
            dirty={dirty.location}
            dispatch={dispatch}
            folderOptions={folderOptions}
            ids={locationIds}
            parentFolderId={formState.parentFolderId}
          />
          <PermissionsSection
            dirty={dirty.permissions}
            dispatch={dispatch}
            ids={permissionsIds}
            readPermission={formState.readPermission}
            writePermission={formState.writePermission}
          />
          <MetadataSubmitButton
            dirty={dirty.metadata}
            saving={status.saving}
          />
        </form>

        <form className="mt-0.5" onSubmit={handleImageUpload}>
          <ImagesSection
            dispatch={dispatch}
            ids={imagesIds}
            imageFile={formState.imageFile}
            uploading={status.uploading}
          />
        </form>
      </div>
    </aside>
  );
}

function InspectorHeader({
  document,
  onCopyLink,
}: {
  document: DocumentSummary;
  onCopyLink: (document: DocumentSummary) => void;
}) {
  return (
    <PanelHeader
      title="Inspector"
      subtitle={document.shortId}
      className="px-3 py-2.5"
      actions={(
        <ToolbarIconButton
          onClick={() => onCopyLink(document)}
          label="Copy Link"
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
        </ToolbarIconButton>
      )}
    />
  );
}

function MetadataSection({
  dirty,
  dispatch,
  ids,
  onAddTag,
  onRemoveTag,
  state,
}: {
  dirty: InspectorDirtyState;
  dispatch: React.Dispatch<InspectorFormAction>;
  ids: MetadataSectionIds;
  onAddTag: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  state: InspectorFormState;
}) {
  return (
    <CollapsibleSection title="Metadata" dirty={dirty.description || dirty.tags || dirty.permalink} className="py-1.5" contentClassName="space-y-2 pt-1.5">
      <fieldset className="space-y-2">
        <legend className="sr-only">Metadata</legend>
        <label className="block space-y-1.5 text-sm" htmlFor={ids.descriptionId}>
          <span className="font-medium text-text-default">Description</span>
          <textarea
            id={ids.descriptionId}
            name="description"
            value={state.description}
            onChange={(event) => dispatch({ type: 'set-description', value: event.target.value })}
            className={INSPECTOR_TEXTAREA_CLASS}
            rows={3}
          />
        </label>

        <TagEditor
          id={ids.tagsId}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          dispatch={dispatch}
          tagDraft={state.tagDraft}
          tags={state.tags}
        />

        <label className="block space-y-1.5 text-sm" htmlFor={ids.permalinkId}>
          <span className="font-medium text-text-default">Permalink</span>
          <input
            id={ids.permalinkId}
            name="permalink"
            value={state.permalink}
            onChange={(event) => dispatch({ type: 'set-permalink', value: event.target.value })}
            className={INSPECTOR_INPUT_CLASS}
            placeholder="custom-slug"
          />
        </label>
      </fieldset>
    </CollapsibleSection>
  );
}

function TagEditor({
  dispatch,
  id,
  onAddTag,
  onRemoveTag,
  tagDraft,
  tags,
}: {
  dispatch: React.Dispatch<InspectorFormAction>;
  id: string;
  onAddTag: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  tagDraft: string;
  tags: string[];
}) {
  return (
    <div className="space-y-1.5 text-sm">
      <label className="font-medium text-text-default" htmlFor={id}>Tags</label>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border-default bg-background-default px-2 py-1 transition-[border-color,box-shadow] focus-within:border-primary-default focus-within:ring-2 focus-within:ring-primary-default/60">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-6 items-center gap-1 rounded-[6px] bg-background-selected px-2 text-xs text-text-default"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemoveTag(tag)}
              className={cn('text-text-subtle hover:text-text-default', FOCUS_RING_CLASS)}
              aria-label={`Remove ${tag} tag`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          name="tag"
          autoComplete="off"
          enterKeyHint="done"
          value={tagDraft}
          onChange={(event) => dispatch({ type: 'set-tag-draft', value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              onAddTag(tagDraft);
              return;
            }

            if (event.key === 'Backspace' && !tagDraft && tags.length > 0) {
              event.preventDefault();
              dispatch({ type: 'set-tags', value: tags.slice(0, -1) });
            }
          }}
          onBlur={() => onAddTag(tagDraft)}
          className="min-w-20 flex-1 bg-transparent text-sm outline-none"
          placeholder={tags.length === 0 ? 'Add tag' : ''}
        />
      </div>
    </div>
  );
}

function LocationSection({
  dirty,
  dispatch,
  folderOptions,
  ids,
  parentFolderId,
}: {
  dirty: boolean;
  dispatch: React.Dispatch<InspectorFormAction>;
  folderOptions: FolderOption[];
  ids: LocationSectionIds;
  parentFolderId: string;
}) {
  return (
    <CollapsibleSection title="Location" dirty={dirty} defaultOpen={false} className="py-1.5" contentClassName="space-y-2 pt-1.5">
      <fieldset className="space-y-2">
        <legend className="sr-only">Location</legend>
        <label className="block space-y-1.5 text-sm" htmlFor={ids.folderId}>
          <span className="font-medium text-text-default">Folder</span>
          <select
            id={ids.folderId}
            name="parentFolderId"
            value={parentFolderId}
            onChange={(event) => dispatch({ type: 'set-parent-folder-id', value: event.target.value })}
            className={INSPECTOR_INPUT_CLASS}
          >
            <option value="">Root</option>
            {folderOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </fieldset>
    </CollapsibleSection>
  );
}

function PermissionsSection({
  dirty,
  dispatch,
  ids,
  readPermission,
  writePermission,
}: {
  dirty: boolean;
  dispatch: React.Dispatch<InspectorFormAction>;
  ids: PermissionsSectionIds;
  readPermission: NotePermissionRole;
  writePermission: NotePermissionRole;
}) {
  return (
    <CollapsibleSection title="Permissions" dirty={dirty} defaultOpen={false} className="py-1.5" contentClassName="space-y-2 pt-1.5">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Permissions</legend>
        <label className="block space-y-1.5 text-sm" htmlFor={ids.readPermissionId}>
          <span className="font-medium text-text-default">Read</span>
          <select
            id={ids.readPermissionId}
            name="readPermission"
            value={readPermission}
            onChange={(event) => dispatch({ type: 'set-read-permission', value: event.target.value as NotePermissionRole })}
            className={INSPECTOR_INPUT_CLASS}
          >
            <option value="owner">Owner</option>
            <option value="signed_in">Signed in</option>
            <option value="guest">Guest</option>
          </select>
        </label>
        <label className="block space-y-1.5 text-sm" htmlFor={ids.writePermissionId}>
          <span className="font-medium text-text-default">Write</span>
          <select
            id={ids.writePermissionId}
            name="writePermission"
            value={writePermission}
            onChange={(event) => dispatch({ type: 'set-write-permission', value: event.target.value as NotePermissionRole })}
            className={INSPECTOR_INPUT_CLASS}
          >
            <option value="owner">Owner</option>
            <option value="signed_in">Signed in</option>
            <option value="guest">Guest</option>
          </select>
        </label>
      </fieldset>
    </CollapsibleSection>
  );
}

function MetadataSubmitButton({
  dirty,
  saving,
}: {
  dirty: boolean;
  saving: boolean;
}) {
  return (
    <div className="flex justify-end pt-1.5">
      <ToolbarIconButton
        type="submit"
        disabled={!dirty || saving}
        title={!dirty ? 'No metadata changes.' : undefined}
        label="Save Metadata"
        tooltip={dirty ? 'Save metadata' : 'No metadata changes.'}
        className={dirty ? 'bg-primary-default text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground' : undefined}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      </ToolbarIconButton>
    </div>
  );
}

function ImagesSection({
  dispatch,
  ids,
  imageFile,
  uploading,
}: {
  dispatch: React.Dispatch<InspectorFormAction>;
  ids: ImagesSectionIds;
  imageFile: File | null;
  uploading: boolean;
}) {
  return (
    <CollapsibleSection title="Images" dirty={Boolean(imageFile)} defaultOpen={false} className="py-1.5" contentClassName="space-y-2 pt-1.5">
      <fieldset className="space-y-2">
        <legend className="sr-only">Images</legend>
        <label className="block space-y-1.5 text-sm" htmlFor={ids.imageId}>
          <span className="font-medium text-text-default">Upload Image</span>
          <input
            id={ids.imageId}
            name="image"
            aria-label="Upload Image"
            type="file"
            accept="image/*"
            onChange={(event) => dispatch({ type: 'set-image-file', value: event.target.files?.[0] ?? null })}
            className="peer sr-only"
          />
          <span className="flex items-center gap-2">
            <span
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-default text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary-default"
              aria-hidden="true"
            >
              <ImagePlus className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-text-subtle">
              {imageFile ? imageFile.name : 'No image selected'}
            </span>
          </span>
        </label>
      </fieldset>
      <div className="flex justify-end">
        <ToolbarIconButton
          type="submit"
          disabled={!imageFile || uploading}
          label="Upload and Insert"
          tooltip={imageFile ? 'Upload and insert image' : 'Choose an image first.'}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </ToolbarIconButton>
      </div>
    </CollapsibleSection>
  );
}
