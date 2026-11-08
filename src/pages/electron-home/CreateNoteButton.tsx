import { ChevronDown, FilePlus2, FolderPlus, LayoutTemplate, Plus, Upload } from 'lucide-react';
import { useState } from 'react';

import { Button, ButtonGroup } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';

import { ActionMenuShortcut, useActionShortcut } from './ActionShortcutContext';

/**
 * The sidebar's create control: one primary button for a new note, split from a menu with the
 * other ways to add something (a template, a Markdown file, a folder).
 */
export function CreateNoteButton({
  canCreate,
  disabledReason,
  onCreate,
  onCreateFromTemplate,
  onImportMarkdown,
  onCreateFolder,
}: {
  canCreate: boolean;
  /** Shown as the tooltip while creating is unavailable. */
  disabledReason?: string;
  onCreate: () => void;
  onCreateFromTemplate?: () => void;
  onImportMarkdown: () => void;
  onCreateFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shortcut = useActionShortcut('new-note');
  // Menu actions open dialogs; let the menu finish closing first so focus doesn't fight them.
  const runAfterClose = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  };

  const main = (
    <Button
      variant="primary"
      size="sm"
      disabled={!canCreate}
      // Stays focusable and hoverable while disabled, so its tooltip can say why.
      focusableWhenDisabled
      onClick={onCreate}
      className="min-w-0 flex-1 justify-start"
    >
      <Plus aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 truncate">New Note</span>
      {shortcut ? <kbd aria-hidden="true" className="ml-auto text-xs opacity-70">{shortcut}</kbd> : null}
    </Button>
  );

  return (
    <ButtonGroup aria-label="Create">
      {disabledReason && !canCreate ? (
        <Tooltip content={disabledReason}>{main}</Tooltip>
      ) : main}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="primary" size="sm" disabled={!canCreate} aria-label="More ways to create" className="shrink-0">
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={(event) => {
            event.preventDefault();
            runAfterClose(onCreate);
          }}>
            <FilePlus2 aria-hidden="true" className="h-4 w-4" />
            New Note
            <ActionMenuShortcut actionId="new-note" />
          </DropdownMenuItem>
          {onCreateFromTemplate ? (
            <DropdownMenuItem onSelect={(event) => {
              event.preventDefault();
              runAfterClose(onCreateFromTemplate);
            }}>
              <LayoutTemplate aria-hidden="true" className="h-4 w-4" />
              New Note from Template…
              <ActionMenuShortcut actionId="new-note-from-template" />
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={(event) => {
            event.preventDefault();
            runAfterClose(onImportMarkdown);
          }}>
            <Upload aria-hidden="true" className="h-4 w-4" />
            Import Markdown Note…
            <ActionMenuShortcut actionId="import-markdown-note" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(event) => {
            event.preventDefault();
            runAfterClose(onCreateFolder);
          }}>
            <FolderPlus aria-hidden="true" className="h-4 w-4" />
            New Folder
            <ActionMenuShortcut actionId="new-folder" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
