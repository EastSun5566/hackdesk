import { Copy, Edit3, Loader2, Save, Share2 } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabelValue,
  SelectTrigger,
} from '@/components/ui/select';
import type {
  DocumentSummary,
  NotePermissionRole,
  UpdateNoteInput,
} from '@/lib/electron-api';
import {
  getHackmdNoteUrl,
  getMarkdownNoteLink,
} from '@/lib/electron-note-links';

function getReadPermissionLabel(permission: NotePermissionRole) {
  switch (permission) {
  case 'owner':
    return 'Private';
  case 'signed_in':
    return 'Signed-in users';
  case 'guest':
    return 'Public';
  }
}

function getWritePermissionLabel(permission: NotePermissionRole) {
  switch (permission) {
  case 'owner':
    return 'Owner only';
  case 'signed_in':
    return 'Signed-in users';
  case 'guest':
    return 'Anyone with the link';
  }
}

const PERMISSION_OPTIONS: NotePermissionRole[] = ['owner', 'signed_in', 'guest'];
const READ_PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_OPTIONS.map((permission) => [permission, getReadPermissionLabel(permission)]),
) as Record<NotePermissionRole, string>;
const WRITE_PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_OPTIONS.map((permission) => [permission, getWritePermissionLabel(permission)]),
) as Record<NotePermissionRole, string>;

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
  return <ShareDialogContent {...props} key={props.document.id} />;
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
  const [readPermission, setReadPermission] = useState<NotePermissionRole>(() => document.readPermission);
  const [writePermission, setWritePermission] = useState<NotePermissionRole>(() => document.writePermission);

  const permissionsDirty =
    readPermission !== document.readPermission
    || writePermission !== document.writePermission;
  const hackmdLink = getHackmdNoteUrl(document);
  const markdownLink = getMarkdownNoteLink(document);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input: UpdateNoteInput = {};
    if (readPermission !== document.readPermission) {
      input.readPermission = readPermission;
    }
    if (writePermission !== document.writePermission) {
      input.writePermission = writePermission;
    }

    if (Object.keys(input).length > 0) {
      onSaveSharing(document, input);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 aria-hidden="true" className="h-4 w-4 text-text-subtle" />
            Share Note
          </DialogTitle>
          <DialogDescription className="sr-only">
            Copy links and adjust who can read or edit this HackMD note.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section aria-labelledby="share-links-heading" className="space-y-2">
            <h3 id="share-links-heading" className="text-sm font-semibold text-text-default">Links</h3>
            <div className="divide-y divide-border-default overflow-hidden rounded-md border border-border-default">
              <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center">
                <label className="text-sm font-medium text-text-default" htmlFor="share-hackmd-link">
                  HackMD link
                </label>
                <Input
                  id="share-hackmd-link"
                  readOnly
                  value={hackmdLink}
                  className="min-w-0 bg-background-muted sm:h-9"
                />
                <Button
                  variant="secondary"
                  type="button"
                  aria-label="Copy HackMD link"
                  onClick={() => onCopyLink(document)}
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Copy
                </Button>
              </div>

              <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center">
                <label className="text-sm font-medium text-text-default" htmlFor="share-markdown-link">
                  Markdown link
                </label>
                <Input
                  id="share-markdown-link"
                  readOnly
                  value={markdownLink}
                  className="min-w-0 bg-background-muted sm:h-9"
                />
                <Button
                  variant="secondary"
                  type="button"
                  aria-label="Copy Markdown link"
                  onClick={() => onCopyMarkdownLink(document)}
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>

            <Button
              variant="secondary"
              onClick={() => onOpenEditor(document)}
            >
              <Edit3 aria-hidden="true" className="h-4 w-4" />
              Open in HackMD
            </Button>
          </section>

          <form
            aria-labelledby="share-access-heading"
            onSubmit={handleSubmit}
            className="space-y-3 border-t border-border-default pt-4"
          >
            <h3 id="share-access-heading" className="text-sm font-semibold text-text-default">Access</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="block space-y-2 text-sm">
                <label className="font-medium text-text-default" htmlFor={readPermissionId}>Read Access</label>
                <Select
                  name="readPermission"
                  value={readPermission}
                  onValueChange={(value) => {
                    if (typeof value === 'string') {
                      setReadPermission(value as NotePermissionRole);
                    }
                  }}
                  items={PERMISSION_OPTIONS.map((permission) => ({
                    value: permission,
                    label: getReadPermissionLabel(permission),
                  }))}
                >
                  <SelectTrigger id={readPermissionId} className="w-full">
                    <SelectLabelValue value={readPermission} labels={READ_PERMISSION_LABELS} />
                  </SelectTrigger>
                  <SelectContent>
                    {PERMISSION_OPTIONS.map((permission) => (
                      <SelectItem key={permission} value={permission}>
                        {getReadPermissionLabel(permission)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="block space-y-2 text-sm">
                <label className="font-medium text-text-default" htmlFor={writePermissionId}>Write Access</label>
                <Select
                  name="writePermission"
                  value={writePermission}
                  onValueChange={(value) => {
                    if (typeof value === 'string') {
                      setWritePermission(value as NotePermissionRole);
                    }
                  }}
                  items={PERMISSION_OPTIONS.map((permission) => ({
                    value: permission,
                    label: getWritePermissionLabel(permission),
                  }))}
                >
                  <SelectTrigger id={writePermissionId} className="w-full">
                    <SelectLabelValue value={writePermission} labels={WRITE_PERMISSION_LABELS} />
                  </SelectTrigger>
                  <SelectContent>
                    {PERMISSION_OPTIONS.map((permission) => (
                      <SelectItem key={permission} value={permission}>
                        {getWritePermissionLabel(permission)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                type="submit"
                disabled={!permissionsDirty || isSaving}
              >
                {isSaving
                  ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  : <Save aria-hidden="true" className="h-4 w-4" />}
                {isSaving ? 'Saving…' : 'Save Access'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
