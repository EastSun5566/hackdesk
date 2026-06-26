import { ChevronDown, ImagePlus, Loader2, X } from 'lucide-react';
import type { Dispatch, ReactNode, SelectHTMLAttributes } from 'react';

import type { NotePermissionRole } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { CollapsibleSection } from './interaction-primitives';
import {
  FOCUS_RING_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
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

const INSPECTOR_INPUT_CLASS = cn(
  TEXT_INPUT_CLASS,
  'h-9 bg-background-default px-2.5 text-text-default',
);
const INSPECTOR_TEXTAREA_CLASS = cn(INSPECTOR_INPUT_CLASS, 'min-h-16 py-2');
const INSPECTOR_SECTION_CLASS = 'py-3';
const INSPECTOR_SECTION_CONTENT_CLASS = 'space-y-4 pb-1 pt-3';
const INSPECTOR_LABEL_CLASS = 'text-xs font-medium text-text-subtle';

function InspectorField({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className={INSPECTOR_LABEL_CLASS} htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function InspectorSelectField({
  children,
  className,
  id,
  label,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
}) {
  return (
    <InspectorField htmlFor={id} label={label}>
      <div className="relative">
        <select
          {...props}
          id={id}
          className={cn(INSPECTOR_INPUT_CLASS, 'appearance-none pe-9', className)}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle"
        />
      </div>
    </InspectorField>
  );
}

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
    <CollapsibleSection
      title="Metadata"
      dirty={dirty.description || dirty.tags || dirty.permalink}
      className={INSPECTOR_SECTION_CLASS}
      contentClassName={INSPECTOR_SECTION_CONTENT_CLASS}
    >
      <fieldset className="space-y-4">
        <legend className="sr-only">Metadata</legend>
        <InspectorField htmlFor={ids.descriptionId} label="Description">
          <textarea
            id={ids.descriptionId}
            aria-label="Description"
            name="description"
            autoComplete="off"
            value={state.description}
            onChange={(event) => dispatch({ type: 'set-description', value: event.target.value })}
            className={INSPECTOR_TEXTAREA_CLASS}
            rows={3}
          />
        </InspectorField>

        <TagEditor
          id={ids.tagsId}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          dispatch={dispatch}
          tagDraft={state.tagDraft}
          tags={state.tags}
        />

        <InspectorField htmlFor={ids.permalinkId} label="Permalink">
          <input
            id={ids.permalinkId}
            aria-label="Permalink"
            name="permalink"
            autoComplete="off"
            spellCheck={false}
            value={state.permalink}
            onChange={(event) => dispatch({ type: 'set-permalink', value: event.target.value })}
            className={INSPECTOR_INPUT_CLASS}
            placeholder="custom-slug"
          />
        </InspectorField>
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
    <div className="space-y-1.5">
      <label className={INSPECTOR_LABEL_CLASS} htmlFor={id}>Tags</label>
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
          spellCheck={false}
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
    <CollapsibleSection
      title="Location"
      dirty={dirty}
      defaultOpen={false}
      className={INSPECTOR_SECTION_CLASS}
      contentClassName={INSPECTOR_SECTION_CONTENT_CLASS}
    >
      <fieldset>
        <legend className="sr-only">Location</legend>
        <InspectorSelectField
          id={ids.folderId}
          label="Folder"
          name="parentFolderId"
          value={parentFolderId}
          onChange={(event) => dispatch({ type: 'set-parent-folder-id', value: event.target.value })}
        >
          <option value="">Root</option>
          {folderOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </InspectorSelectField>
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
    <CollapsibleSection
      title="Permissions"
      dirty={dirty}
      defaultOpen={false}
      className={INSPECTOR_SECTION_CLASS}
      contentClassName={INSPECTOR_SECTION_CONTENT_CLASS}
    >
      <div className="space-y-4">
        <PermissionSegmentedField
          legend="Read"
          name={ids.readPermissionId}
          value={readPermission}
          onChange={(value) => dispatch({ type: 'set-read-permission', value })}
        />
        <PermissionSegmentedField
          legend="Write"
          name={ids.writePermissionId}
          value={writePermission}
          onChange={(value) => dispatch({ type: 'set-write-permission', value })}
        />
      </div>
    </CollapsibleSection>
  );
}

const PERMISSION_OPTIONS: Array<{ label: string; value: NotePermissionRole }> = [
  { label: 'Owner', value: 'owner' },
  { label: 'Signed in', value: 'signed_in' },
  { label: 'Guest', value: 'guest' },
];

function PermissionSegmentedField({
  legend,
  name,
  onChange,
  value,
}: {
  legend: string;
  name: string;
  onChange: (value: NotePermissionRole) => void;
  value: NotePermissionRole;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className={INSPECTOR_LABEL_CLASS}>{legend}</legend>
      <div className="grid grid-cols-3 gap-0.5 rounded-md border border-border-default bg-background-muted p-0.5">
        {PERMISSION_OPTIONS.map((option) => (
          <label key={option.value} className="min-w-0 cursor-pointer">
            <input
              className="peer sr-only"
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="flex h-8 min-w-0 items-center justify-center rounded-[5px] px-1.5 text-center text-xs text-text-subtle peer-checked:bg-background-selected peer-checked:font-medium peer-checked:text-text-default peer-focus-visible:ring-2 peer-focus-visible:ring-primary-default">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function MetadataSubmitButton({
  dirty,
  saving,
}: {
  dirty: boolean;
  saving: boolean;
}) {
  const status = saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : 'All changes saved';

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-default/70 py-3">
      <span className="min-w-0 truncate text-xs text-text-subtle" aria-live="polite">
        {status}
      </span>
      <button
        type="submit"
        disabled={!dirty || saving}
        className={cn(PRIMARY_BUTTON_CLASS, 'shrink-0 justify-center')}
      >
        {saving ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
        <span>{saving ? 'Saving…' : 'Save changes'}</span>
      </button>
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
    <CollapsibleSection
      title="Images"
      dirty={Boolean(imageFile)}
      defaultOpen={false}
      className={INSPECTOR_SECTION_CLASS}
      contentClassName={INSPECTOR_SECTION_CONTENT_CLASS}
    >
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Images</legend>
        <span className={INSPECTOR_LABEL_CLASS}>Upload image</span>
        <input
          id={ids.imageId}
          name="image"
          aria-label="Upload Image"
          type="file"
          accept="image/*"
          onChange={(event) => dispatch({ type: 'set-image-file', value: event.target.files?.[0] ?? null })}
          className="peer sr-only"
        />
        <label
          htmlFor={ids.imageId}
          className={cn(
            'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border border-border-default bg-background-default px-2.5 text-sm hover:bg-element-bg-hover',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-default',
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background-muted text-text-subtle">
            <ImagePlus aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-text-default">
            {imageFile ? imageFile.name : 'Choose an image'}
          </span>
          <span className="shrink-0 text-xs text-text-subtle">Browse</span>
        </label>
      </fieldset>
      <button
        type="submit"
        disabled={!imageFile || uploading}
        className={cn(SECONDARY_BUTTON_CLASS, 'w-full justify-center')}
      >
        {uploading ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <ImagePlus aria-hidden="true" className="size-4" />
        )}
        <span>{uploading ? 'Uploading…' : 'Upload and insert'}</span>
      </button>
    </CollapsibleSection>
  );
}
