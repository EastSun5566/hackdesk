import { FolderPlus, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CreateFolderInput } from '@/lib/electron-api';

import type { CreateFolderDialogState } from './types';
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_INPUT_CLASS } from './ui';

export function CreateFolderDialog({
  state,
  scopeLabel,
  parentFolderLabel,
  isCreating,
  onStateChange,
  onCreate,
}: {
  state: CreateFolderDialogState;
  scopeLabel: string;
  parentFolderLabel: string | null;
  isCreating: boolean;
  onStateChange: (state: CreateFolderDialogState) => void;
  onCreate: (input: CreateFolderInput) => void;
}) {
  const normalizedName = state.name.trim();
  const normalizedDescription = state.description.trim();
  const normalizedIcon = state.icon.trim();
  const normalizedColor = state.color.trim();
  const location = parentFolderLabel ? `${scopeLabel} / ${parentFolderLabel}` : scopeLabel;
  const closedState = { open: false, name: '', description: '', icon: '', color: '' };

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? state : closedState)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
          <DialogDescription>Create a folder in {location}.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalizedName) {
              onCreate({
                name: normalizedName,
                ...(normalizedDescription ? { description: normalizedDescription } : {}),
                ...(normalizedIcon ? { icon: normalizedIcon } : {}),
                ...(normalizedColor ? { color: normalizedColor } : {}),
              });
            }
          }}
        >
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Name</span>
            <input
              name="name"
              autoFocus
              value={state.name}
              onChange={(event) => onStateChange({ ...state, name: event.target.value })}
              className={TEXT_INPUT_CLASS}
              placeholder="Projects"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Description</span>
            <textarea
              name="description"
              value={state.description}
              onChange={(event) => onStateChange({ ...state, description: event.target.value })}
              className={`${TEXT_INPUT_CLASS} min-h-20 py-2`}
              rows={3}
              placeholder="Active project notes"
            />
          </label>
          <details className="rounded-md border border-border-default bg-background-muted px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none rounded-[4px] text-xs font-semibold uppercase tracking-wide text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default">
              Advanced
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block space-y-2 text-sm">
                <span className="font-medium">Icon codepoint</span>
                <input
                  name="icon"
                  value={state.icon}
                  onChange={(event) => onStateChange({ ...state, icon: event.target.value })}
                  className={TEXT_INPUT_CLASS}
                  placeholder="1F4C1"
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="font-medium">Color</span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 rounded-[4px] border border-border-default"
                    style={{ backgroundColor: normalizedColor || 'transparent' }}
                    aria-hidden="true"
                  />
                  <input
                    name="color"
                    value={state.color}
                    onChange={(event) => onStateChange({ ...state, color: event.target.value })}
                    className={TEXT_INPUT_CLASS}
                    placeholder="#2F80ED"
                  />
                </span>
              </label>
            </div>
          </details>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onStateChange(closedState)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!normalizedName || isCreating}
              className={PRIMARY_BUTTON_CLASS}
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              Create
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
