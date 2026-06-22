import { Copy, Edit3, Loader2, Save, Share2 } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  DocumentSummary,
  NotePermissionRole,
  UpdateNoteInput,
} from '@/lib/electron-api';
import {
  getHackmdNoteUrl,
  getMarkdownNoteLink,
} from '@/lib/electron-note-links';
import { cn } from '@/lib/utils';

import {
  FOCUS_RING_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TEXT_INPUT_CLASS,
} from './ui';

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
  return <ShareDialogContent key={props.document.id} {...props} />;
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
          <DialogDescription>
            Copy links and adjust who can read or edit this HackMD note.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-default" htmlFor="share-hackmd-link">
                HackMD Link
              </label>
              <div className="flex gap-2">
                <input
                  id="share-hackmd-link"
                  readOnly
                  value={hackmdLink}
                  className={cn(TEXT_INPUT_CLASS, 'bg-background-muted')}
                />
                <button
                  type="button"
                  onClick={() => onCopyLink(document)}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-default" htmlFor="share-markdown-link">
                Markdown Link
              </label>
              <div className="flex gap-2">
                <input
                  id="share-markdown-link"
                  readOnly
                  value={markdownLink}
                  className={cn(TEXT_INPUT_CLASS, 'bg-background-muted')}
                />
                <button
                  type="button"
                  onClick={() => onCopyMarkdownLink(document)}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenEditor(document)}
              className={SECONDARY_BUTTON_CLASS}
            >
              <Edit3 aria-hidden="true" className="h-4 w-4" />
              Open Web Editor
            </button>
          </section>

          <form onSubmit={handleSubmit} className="space-y-3 border-t border-border-default pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm" htmlFor={readPermissionId}>
                <span className="font-medium text-text-default">Read Access</span>
                <select
                  id={readPermissionId}
                  name="readPermission"
                  value={readPermission}
                  onChange={(event) => setReadPermission(event.target.value as NotePermissionRole)}
                  className={TEXT_INPUT_CLASS}
                >
                  <option value="owner">{getReadPermissionLabel('owner')}</option>
                  <option value="signed_in">{getReadPermissionLabel('signed_in')}</option>
                  <option value="guest">{getReadPermissionLabel('guest')}</option>
                </select>
              </label>

              <label className="block space-y-2 text-sm" htmlFor={writePermissionId}>
                <span className="font-medium text-text-default">Write Access</span>
                <select
                  id={writePermissionId}
                  name="writePermission"
                  value={writePermission}
                  onChange={(event) => setWritePermission(event.target.value as NotePermissionRole)}
                  className={TEXT_INPUT_CLASS}
                >
                  <option value="owner">{getWritePermissionLabel('owner')}</option>
                  <option value="signed_in">{getWritePermissionLabel('signed_in')}</option>
                  <option value="guest">{getWritePermissionLabel('guest')}</option>
                </select>
              </label>
            </div>

            <p className="text-xs leading-5 text-text-subtle">
              Current sharing: {getReadPermissionLabel(readPermission)} read, {getWritePermissionLabel(writePermission)} write.
            </p>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!permissionsDirty || isSaving}
                title={!permissionsDirty ? 'No sharing changes.' : undefined}
                className={cn(PRIMARY_BUTTON_CLASS, FOCUS_RING_CLASS)}
              >
                {isSaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                Save Sharing
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
