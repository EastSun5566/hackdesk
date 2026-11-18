import { Check, Copy, ExternalLink, Globe, Loader2, Lock, Save, Share2, Users } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type {
  DocumentSummary,
  NotePermissionRole,
  UpdateNoteInput,
} from '@/lib/electron-api';
import {
  getHackmdNoteUrl,
  getMarkdownNoteLink,
} from '@/lib/electron-note-links';

import { SettingsSection } from './SettingsPrimitives';

type PermissionOption = {
  value: NotePermissionRole;
  label: string;
  icon: typeof Lock;
};

const READ_PERMISSION_OPTIONS: readonly PermissionOption[] = [
  { value: 'owner', label: 'Private', icon: Lock },
  { value: 'signed_in', label: 'Signed in', icon: Users },
  { value: 'guest', label: 'Public', icon: Globe },
];

const WRITE_PERMISSION_OPTIONS: readonly PermissionOption[] = [
  { value: 'owner', label: 'Owner', icon: Lock },
  { value: 'signed_in', label: 'Signed in', icon: Users },
  { value: 'guest', label: 'Everyone', icon: Globe },
];

function getReadSummary(permission: NotePermissionRole) {
  switch (permission) {
  case 'owner':
    return 'Private (owner only)';
  case 'signed_in':
    return 'Signed-in users can read';
  case 'guest':
    return 'Anyone with the link can read';
  }
}

function getPermalinkPrefix(document: Pick<DocumentSummary, 'teamPath' | 'userPath'>) {
  if (document.teamPath) return `hackmd.io/@${document.teamPath}/`;
  if (document.userPath) return `hackmd.io/@${document.userPath}/`;
  return 'hackmd.io/';
}

type ShareDialogProps = {
  open: boolean;
  document: DocumentSummary;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onCopyLink: (document: DocumentSummary) => void;
  onCopyMarkdownLink: (document: DocumentSummary) => void;
  onOpenEditor: (document: DocumentSummary) => void;
  onSaveSharing: (document: DocumentSummary, input: UpdateNoteInput) => void;
};

export function ShareDialog(props: ShareDialogProps) {
  return (
    <ShareDialogContent
      {...props}
      key={`${props.document.id}:${props.open ? 'open' : 'closed'}`}
    />
  );
}

function ShareDialogContent({
  open,
  document,
  isSaving,
  onOpenChange,
  onCopyLink,
  onCopyMarkdownLink,
  onOpenEditor,
  onSaveSharing,
}: ShareDialogProps) {
  const readPermissionId = useId();
  const writePermissionId = useId();
  const permalinkId = useId();
  const [readPermission, setReadPermission] = useState<NotePermissionRole>(() => document.readPermission);
  const [writePermission, setWritePermission] = useState<NotePermissionRole>(() => document.writePermission);
  const [permalink, setPermalink] = useState(() => document.permalink ?? '');
  const [copiedField, setCopiedField] = useState<'hackmd' | 'markdown' | null>(null);

  useEffect(() => {
    if (!copiedField) return undefined;
    const timer = window.setTimeout(() => setCopiedField(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copiedField]);

  const trimmedPermalink = permalink.trim();
  const savedPermalink = (document.permalink ?? '').trim();
  const dirty =
    readPermission !== document.readPermission
    || writePermission !== document.writePermission
    || trimmedPermalink !== savedPermalink;

  const hackmdLink = getHackmdNoteUrl(document);
  const markdownLink = getMarkdownNoteLink(document);
  const noteTitle = document.title.trim() || 'Untitled';
  const permalinkPrefix = getPermalinkPrefix(document);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input: UpdateNoteInput = {};
    if (readPermission !== document.readPermission) {
      input.readPermission = readPermission;
    }
    if (writePermission !== document.writePermission) {
      input.writePermission = writePermission;
    }
    if (trimmedPermalink !== savedPermalink) {
      input.permalink = trimmedPermalink;
    }

    if (Object.keys(input).length > 0) {
      onSaveSharing(document, input);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-140">
        <DialogHeader variant="beside-close">
          <DialogTitle variant="with-icon">
            <Share2 aria-hidden="true" className="h-4 w-4 text-text-subtle" />
            Share Note
          </DialogTitle>
          <DialogDescription variant="meta">
            {noteTitle} · {getReadSummary(readPermission)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <SettingsSection title="Access">
            <PermissionCardRow
              id={readPermissionId}
              label="Read access"
              description="Who can view this note"
              name="readPermission"
              options={READ_PERMISSION_OPTIONS}
              value={readPermission}
              onChange={setReadPermission}
            />
            <PermissionCardRow
              id={writePermissionId}
              label="Write access"
              description="Who can edit this note"
              name="writePermission"
              options={WRITE_PERMISSION_OPTIONS}
              value={writePermission}
              onChange={setWritePermission}
            />
          </SettingsSection>

          <SettingsSection
            title="Links"
            action={(
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => onOpenEditor(document)}
              >
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                Open in HackMD
              </Button>
            )}
          >
            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
              <div className="sm:w-36 sm:shrink-0">
                <label className="font-medium leading-5 text-text-default" htmlFor={permalinkId}>
                  Permalink
                </label>
                <p className="text-xs leading-5 text-text-subtle">Custom URL slug</p>
              </div>
              <div className="flex h-8 min-w-0 flex-1 items-center overflow-hidden rounded border border-border-default bg-background-default transition-colors focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus-ring">
                <span className="shrink-0 select-none pl-2.5 text-xs text-text-subtle">
                  {permalinkPrefix}
                </span>
                <input
                  id={permalinkId}
                  name="permalink"
                  aria-label="Permalink"
                  autoComplete="off"
                  spellCheck={false}
                  value={permalink}
                  onChange={(event) => setPermalink(event.target.value)}
                  placeholder="custom-slug"
                  className="h-full min-w-0 flex-1 bg-transparent pr-2.5 text-sm text-text-default outline-none placeholder:text-text-subtle/60"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
              <label className="font-medium leading-5 text-text-default sm:w-36 sm:shrink-0" htmlFor="share-hackmd-link">
                HackMD link
              </label>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  id="share-hackmd-link"
                  readOnly
                  value={hackmdLink}
                  variant="read-only"
                  className="h-8 min-w-0 flex-1"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  aria-label="Copy HackMD link"
                  onClick={() => {
                    onCopyLink(document);
                    setCopiedField('hackmd');
                  }}
                >
                  {copiedField === 'hackmd'
                    ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-success-default" />
                    : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
                  <span>{copiedField === 'hackmd' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
              <label className="font-medium leading-5 text-text-default sm:w-36 sm:shrink-0" htmlFor="share-markdown-link">
                Markdown link
              </label>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  id="share-markdown-link"
                  readOnly
                  value={markdownLink}
                  variant="read-only"
                  className="h-8 min-w-0 flex-1"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  aria-label="Copy Markdown link"
                  onClick={() => {
                    onCopyMarkdownLink(document);
                    setCopiedField('markdown');
                  }}
                >
                  {copiedField === 'markdown'
                    ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-success-default" />
                    : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
                  <span>{copiedField === 'markdown' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>
          </SettingsSection>

          <DialogFooter variant="status">
            <span className="min-w-0 truncate text-xs text-text-subtle" aria-live="polite">
              {isSaving
                ? 'Saving sharing settings…'
                : dirty
                  ? 'Unsaved sharing changes'
                  : 'All sharing settings saved'}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={!dirty || isSaving}
              >
                {isSaving
                  ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  : <Save aria-hidden="true" className="h-4 w-4" />}
                <span>{isSaving ? 'Saving…' : 'Save Changes'}</span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissionCardRow({
  id,
  label,
  description,
  name,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  name: string;
  options: readonly PermissionOption[];
  value: NotePermissionRole;
  onChange: (value: NotePermissionRole) => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
      <div className="sm:w-36 sm:shrink-0">
        <span id={id} className="block font-medium leading-5 text-text-default">{label}</span>
        <p className="text-xs leading-5 text-text-subtle">{description}</p>
      </div>
      <RadioGroup
        aria-labelledby={id}
        name={name}
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as NotePermissionRole)}
        variant="segmented"
        className="flex-1"
      >
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <RadioGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.label}
              variant="segment"
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span className="truncate whitespace-nowrap">{option.label}</span>
            </RadioGroupItem>
          );
        })}
      </RadioGroup>
    </div>
  );
}
