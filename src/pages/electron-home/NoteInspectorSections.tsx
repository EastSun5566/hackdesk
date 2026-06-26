import { ImagePlus, Loader2, Save, X } from 'lucide-react';
import type { Dispatch } from 'react';

import type { NotePermissionRole } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { CollapsibleSection, ToolbarIconButton } from './interaction-primitives';
import {
  FOCUS_RING_CLASS,
  TEXT_INPUT_CLASS,
} from './ui';
import type {
  FolderOption,
  InspectorDirtyState,
  InspectorFormAction,
  InspectorFormState,
} from './useNoteInspectorForm';

export type MetadataSectionIds = {
  descriptionId: string;
  permalinkId: string;
  tagsId: string;
};

export type LocationSectionIds = {
  folderId: string;
};

export type PermissionsSectionIds = {
  readPermissionId: string;
  writePermissionId: string;
};

export type ImagesSectionIds = {
  imageId: string;
};

const INSPECTOR_INPUT_CLASS = TEXT_INPUT_CLASS
  .replace('h-10', 'h-9')
  .replace('px-3', 'px-2.5');
const INSPECTOR_TEXTAREA_CLASS = cn(INSPECTOR_INPUT_CLASS, 'min-h-16 py-2');

export function MetadataSection({
  dirty,
  dispatch,
  ids,
  onAddTag,
  onRemoveTag,
  state,
}: {
  dirty: InspectorDirtyState;
  dispatch: Dispatch<InspectorFormAction>;
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
  dispatch: Dispatch<InspectorFormAction>;
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

export function LocationSection({
  dirty,
  dispatch,
  folderOptions,
  ids,
  parentFolderId,
}: {
  dirty: boolean;
  dispatch: Dispatch<InspectorFormAction>;
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

export function PermissionsSection({
  dirty,
  dispatch,
  ids,
  readPermission,
  writePermission,
}: {
  dirty: boolean;
  dispatch: Dispatch<InspectorFormAction>;
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

export function MetadataSubmitButton({
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

export function ImagesSection({
  dispatch,
  ids,
  imageFile,
  uploading,
}: {
  dispatch: Dispatch<InspectorFormAction>;
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
