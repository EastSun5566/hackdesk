import {
  FileText,
  FileArchive,
  FolderTree,
  FolderPlus,
  FolderPen,
  Trash2,
  Keyboard,
  PanelLeft,
  PanelRight,
  RefreshCcw,
  Settings2,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCommandPaletteActions } from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';

import type { CommandPaletteState } from './types';

const ACTION_ICONS: Record<ElectronActionId, ReactNode> = {
  'new-note': <FileText className="h-4 w-4" />,
  'new-folder': <FolderPlus className="h-4 w-4" />,
  'rename-folder': <FolderPen className="h-4 w-4" />,
  'delete-folder': <Trash2 className="h-4 w-4" />,
  'open-settings': <Settings2 className="h-4 w-4" />,
  'open-command-palette': <Keyboard className="h-4 w-4" />,
  refresh: <RefreshCcw className="h-4 w-4" />,
  'export-debug-logs': <FileArchive className="h-4 w-4" />,
  'focus-workspace': <PanelLeft className="h-4 w-4" />,
  'focus-navigator': <FolderTree className="h-4 w-4" />,
  'focus-editor': <PanelRight className="h-4 w-4" />,
};

export function CommandPaletteDialog({
  state,
  onStateChange,
  onRunAction,
}: {
  state: CommandPaletteState;
  onStateChange: (state: CommandPaletteState) => void;
  onRunAction: (actionId: ElectronActionId) => void;
}) {
  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? { ...state, open } : { open: false, search: '' })}
    >
      <DialogContent className="top-[20%] max-w-xl translate-y-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
        </DialogHeader>
        <Command shouldFilter>
          <CommandInput
            autoFocus
            value={state.search}
            onValueChange={(search) => onStateChange({ ...state, search })}
            placeholder="Search commands"
          />
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>
            <CommandGroup heading="Actions">
              {getCommandPaletteActions().map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.keywords.join(' ')}`}
                  onSelect={() => {
                    onRunAction(action.id);
                    onStateChange({ open: false, search: '' });
                  }}
                >
                  <span className="mr-3 text-text-subtle">{ACTION_ICONS[action.id]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{action.label}</span>
                    <span className="block truncate text-xs text-text-subtle">{action.description}</span>
                  </span>
                  {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
