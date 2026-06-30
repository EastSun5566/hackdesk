import { Loader2, X } from 'lucide-react';
import type { Dispatch, ReactNode } from 'react';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabelValue,
  SelectTrigger,
} from '@/components/ui/select';
import type { NotePermissionRole } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { CollapsibleSection } from './interaction-primitives';
import {
  FOCUS_RING_CLASS,
  PRIMARY_BUTTON_CLASS,
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
  className,
  id,
  label,
  name,
  onValueChange,
  options,
  value,
}: {
  id: string;
  label: string;
  name: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
  className?: string;
}) {
  return (
    <InspectorField htmlFor={id} label={label}>
      <Select
        name={name}
        value={value}
        onValueChange={(nextValue) => {
          if (typeof nextValue === 'string') {
            onValueChange(nextValue);
          }
        }}
        items={options}
      >
        <SelectTrigger
          id={id}
          className={cn(INSPECTOR_INPUT_CLASS, 'w-full justify-between pe-2.5', className)}
        >
          <SelectLabelValue
            value={value}
            labels={Object.fromEntries(options.map((option) => [option.value, option.label]))}
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
          onValueChange={(value) => dispatch({ type: 'set-parent-folder-id', value })}
          options={[
            { value: '', label: 'Root' },
            ...folderOptions.map((option) => ({ value: option.id, label: option.label })),
          ]}
        />
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
      <RadioGroup
        name={name}
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as NotePermissionRole)}
        className="grid grid-cols-3 gap-0.5 rounded-md border border-border-default bg-background-muted p-0.5"
      >
        {PERMISSION_OPTIONS.map((option) => (
          <RadioGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className="flex h-8 w-full min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-[5px] border-0 bg-transparent px-1.5 text-center text-xs text-text-subtle data-[checked]:bg-background-selected data-[checked]:font-medium data-[checked]:text-text-default"
          >
            <span className="min-w-0 truncate whitespace-nowrap">
              {option.label}
            </span>
          </RadioGroupItem>
        ))}
      </RadioGroup>
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
