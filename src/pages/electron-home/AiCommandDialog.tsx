import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel, Input, Textarea } from '@/components/ui/field';
import { RadioGroup, RadioGroupIndicator, RadioGroupItem } from '@/components/ui/radio-group';
import {
  MAX_AI_COMMAND_NAME_CHARACTERS,
  MAX_AI_COMMAND_PROMPT_CHARACTERS,
  getAiErrorMessage,
  type AiDelivery,
} from '@/lib/ai';
import { cn } from '@/lib/utils';

import type { AiCommandDraft } from './ai-commands';

const NAME_ID = 'ai-command-name';
const PROMPT_ID = 'ai-command-prompt';

const DELIVERY_OPTIONS: { value: AiDelivery; label: string; description: string }[] = [
  { value: 'replace', label: 'Replace the selection', description: 'For rewrites, such as changing tone or format.' },
  { value: 'insert-below', label: 'Add below', description: 'For new text, such as a summary or a to-do list.' },
];

/** Creates or edits a saved AI command; Settings and the ⌘K menu's "Save as command" both use it. */
export function AiCommandDialog({
  open,
  title,
  description,
  initial,
  submitLabel,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  initial: AiCommandDraft;
  submitLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: AiCommandDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = draft.name.trim();
  const prompt = draft.prompt.trim();
  const canSave = Boolean(name && prompt) && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name, prompt, delivery: draft.delivery });
      onOpenChange(false);
    } catch (submitError) {
      setError(getAiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field>
            <FieldLabel htmlFor={NAME_ID}>Name</FieldLabel>
            <Input
              id={NAME_ID}
              name="name"
              value={draft.name}
              maxLength={MAX_AI_COMMAND_NAME_CHARACTERS}
              placeholder="Meeting notes…"
              autoComplete="off"
              onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={PROMPT_ID}>Prompt</FieldLabel>
            <Textarea
              id={PROMPT_ID}
              name="prompt"
              rows={5}
              value={draft.prompt}
              maxLength={MAX_AI_COMMAND_PROMPT_CHARACTERS}
              placeholder="Turn this into meeting notes with decisions and action items…"
              onChange={event => setDraft(current => ({ ...current, prompt: event.target.value }))}
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Result</legend>
            <RadioGroup
              name="delivery"
              value={draft.delivery}
              onValueChange={value => setDraft(current => ({ ...current, delivery: value as AiDelivery }))}
              className="grid gap-2 sm:grid-cols-2"
            >
              {DELIVERY_OPTIONS.map(option => (
                <RadioGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={option.label}
                  className={cn(
                    'group flex h-auto w-full cursor-pointer items-start justify-start gap-3 rounded-md border border-border-default bg-background-default px-3 py-2.5 text-left text-primary-default',
                    draft.delivery === option.value && 'border-primary-default/50 bg-primary-soft/40',
                  )}
                >
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-default bg-background-default text-primary-default group-data-[checked]:border-primary-default">
                    <RadioGroupIndicator />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text-default">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-text-subtle">{option.description}</span>
                  </span>
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </fieldset>
          {error ? <p role="alert" className="text-sm text-destructive-default">{error}</p> : null}
          <DialogFooter>
            <Button variant="secondary" type="button" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!canSave}>
              {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
