import { FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FolderTreeNote } from '@/lib/hackmd-folders';
import { TEMPLATES_FOLDER_NAME } from '@/lib/note-templates';

/** Picks a note from the Templates folder to start a new note from. */
export function TemplatePickerDialog({ open, onOpenChange, templates, onChoose }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: FolderTreeNote[];
  /** Starts the new note; resolves once it is open, so the dialog can show progress meanwhile. */
  onChoose: (template: FolderTreeNote) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const choose = (template: FolderTreeNote) => {
    if (busyId) return;
    setBusyId(template.note.id);
    void onChoose(template).finally(() => setBusyId(null));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="gap-0 overflow-hidden p-0">
        <DialogHeader className="px-4 pb-2 pt-4">
          <DialogTitle>New Note from Template</DialogTitle>
          <DialogDescription>
            {`Templates are the notes in this workspace's ${TEMPLATES_FOLDER_NAME} folder.`}
          </DialogDescription>
        </DialogHeader>
        <Command loop label="Templates">
          <CommandInput autoFocus placeholder="Search templates…" />
          <CommandList className="max-h-80">
            <CommandEmpty>
              {templates.length
                ? 'No matching templates.'
                : `No templates yet. Add notes to a ${TEMPLATES_FOLDER_NAME} folder, or use Save as Template.`}
            </CommandEmpty>
            {templates.map(template => (
              <CommandItem
                key={template.note.id}
                value={`${template.note.title} ${template.note.id}`}
                keywords={[template.note.title, template.folderLabel]}
                disabled={busyId !== null && busyId !== template.note.id}
                onSelect={() => choose(template)}
              >
                {busyId === template.note.id
                  ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  : <FileText aria-hidden="true" className="size-4" />}
                <span className="min-w-0 flex-1 truncate">{template.note.title || 'Untitled'}</span>
                {template.folderPath.length > 1 ? (
                  <span className="truncate text-xs text-text-subtle">{template.folderPath.slice(1).map(folder => folder.name).join(' / ')}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
