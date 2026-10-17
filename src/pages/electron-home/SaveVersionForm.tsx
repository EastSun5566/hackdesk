import { useId, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, Input, Textarea } from '@/components/ui/field';
import type { NoteVersionSummary } from '@/lib/electron-api';

import { formatDate } from './ui';
import { getVersionErrorMessage, useCreateNoteVersion, useUpdateNoteVersion } from './useNoteVersions';

const NAME_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;

const NO_CONTENT_CHANGE_MESSAGE = 'Nothing has changed since the latest named version, so there is nothing new to save.';

/** Save the live note as a version, name an auto-saved version, or edit a named one. */
export type VersionFormMode =
  | { kind: 'create' }
  | { kind: 'name'; version: NoteVersionSummary }
  | { kind: 'edit'; version: NoteVersionSummary };

const FORM_TEXT = {
  create: { label: 'Save version', submit: 'Save Version' },
  name: { label: 'Name version', submit: 'Name Version' },
  edit: { label: 'Edit version', submit: 'Save Changes' },
} as const;

export function SaveVersionForm({
  noteId,
  noteDirty,
  mode,
  onSaved,
  onCancel,
}: {
  noteId: string;
  noteDirty: boolean;
  mode: VersionFormMode;
  onSaved: (version: NoteVersionSummary) => void;
  onCancel: () => void;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const editing = mode.kind === 'edit' ? mode.version : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const create = useCreateNoteVersion(noteId);
  const update = useUpdateNoteVersion(noteId);
  const pending = create.isPending || update.isPending;
  const trimmedName = name.trim();
  const text = FORM_TEXT[mode.kind];

  const showError = (error: unknown) => setMessage(getVersionErrorMessage(error));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedName || pending) return;
    setMessage(null);
    const trimmedDescription = description.trim();

    if (mode.kind === 'edit') {
      update.mutate(
        { versionId: mode.version.id, input: { name: trimmedName, description: trimmedDescription } },
        { onSuccess: onSaved, onError: showError },
      );
      return;
    }

    create.mutate(
      {
        name: trimmedName,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        ...(mode.kind === 'name' ? { base: `version:${mode.version.id}` as const } : {}),
      },
      {
        onSuccess: (result) => {
          if (result.status === 'created') {
            onSaved(result.version);
          } else {
            setMessage(result.status === 'no_content_change'
              ? NO_CONTENT_CHANGE_MESSAGE
              : `${mode.kind === 'name' ? 'This' : 'The latest'} version already has a name.`);
          }
        },
        onError: showError,
      },
    );
  };

  return (
    <form aria-label={text.label} onSubmit={submit} className="space-y-3 border-b border-border-default px-5 py-4">
      {mode.kind === 'name' ? (
        <p className="text-xs text-text-subtle">Name the version auto-saved {formatDate(mode.version.createdAtMillis)}.</p>
      ) : null}
      {mode.kind === 'create' && noteDirty ? (
        <p className="text-xs text-text-subtle">Save the note first. Unsaved edits are not included in the version.</p>
      ) : null}
      <Field>
        <FieldLabel htmlFor={nameId}>Name</FieldLabel>
        <Input
          id={nameId}
          autoFocus
          required
          maxLength={NAME_MAX_LENGTH}
          value={name}
          placeholder="Before launch"
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
        <Textarea
          id={descriptionId}
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <FieldDescription>Optional.</FieldDescription>
      </Field>
      {message ? <p role="status" className="text-sm text-text-default">{message}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!trimmedName || pending}>
          {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
          {text.submit}
        </Button>
      </div>
    </form>
  );
}
