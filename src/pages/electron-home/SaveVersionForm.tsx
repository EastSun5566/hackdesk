import { useId, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, Input, Textarea } from '@/components/ui/field';
import type { NoteVersionSummary } from '@/lib/electron-api';

import { getVersionErrorMessage, useCreateNoteVersion } from './useNoteVersions';

const NAME_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;

const CONFLICT_MESSAGES = {
  no_content_change: 'Nothing has changed since the latest named version, so there is nothing new to save.',
  version_already_named: 'The latest version already has a name.',
} as const;

/** Names the note's current content on HackMD as a version. */
export function SaveVersionForm({
  noteId,
  noteDirty,
  onSaved,
  onCancel,
}: {
  noteId: string;
  noteDirty: boolean;
  onSaved: (version: NoteVersionSummary) => void;
  onCancel: () => void;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const create = useCreateNoteVersion(noteId);
  const trimmedName = name.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedName || create.isPending) return;
    setMessage(null);
    create.mutate(
      { name: trimmedName, ...(description.trim() ? { description: description.trim() } : {}) },
      {
        onSuccess: (result) => {
          if (result.status === 'created') {
            onSaved(result.version);
          } else {
            setMessage(CONFLICT_MESSAGES[result.status]);
          }
        },
        onError: (error) => setMessage(getVersionErrorMessage(error)),
      },
    );
  };

  return (
    <form aria-label="Save version" onSubmit={submit} className="space-y-3 border-b border-border-default px-5 py-4">
      {noteDirty ? (
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
        <Button type="submit" variant="primary" disabled={!trimmedName || create.isPending}>
          {create.isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
          Save Version
        </Button>
      </div>
    </form>
  );
}
