import { useActionShortcut } from './ActionShortcutContext';
import {
  Check,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Toolbar } from '@/components/ui/toolbar';
import type { NotePermissionRole } from '@/lib/electron-api';
import {
  clearNoteFinderFilters,
  clearNoteFinderQuery,
  DEFAULT_NOTE_FINDER_STATE,
  getActiveNoteFinderFilterCount,
  getNoteFinderOptions,
  hasActiveNoteFinderFilters,
  togglePermissionFilter,
  type NoteFinderSortMode,
  type NoteFinderState,
} from '@/lib/electron-note-finder';
import type { ElectronNoteTag } from '@/lib/electron-note-tags';
import { cn } from '@/lib/utils';

import { ToolbarDropdownIconTrigger } from './interaction-primitives';
import { FOCUS_RING_CLASS } from './ui';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const SORT_LABELS: Record<NoteFinderSortMode, string> = {
  'updated-desc': 'Recently updated',
  'updated-asc': 'Oldest updated',
  'title-asc': 'Title A-Z',
  'title-desc': 'Title Z-A',
  'created-desc': 'Created newest',
};

const SORT_MODES: NoteFinderSortMode[] = ['updated-desc', 'updated-asc', 'title-asc', 'title-desc', 'created-desc'];

const PERMISSION_LABELS: Record<NotePermissionRole, string> = {
  owner: 'Owner',
  signed_in: 'Signed in',
  guest: 'Guest',
};

function CheckedIcon({ checked }: { checked: boolean }) {
  return <Check aria-hidden="true" className={cn('h-3.5 w-3.5', checked ? 'opacity-100' : 'opacity-0')} />;
}

function FilterChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        'inline-flex h-6 min-w-0 items-center gap-1 rounded-md border border-border-default bg-background-default px-2 text-xs text-text-default transition-colors hover:bg-element-bg-hover',
        FOCUS_RING_CLASS,
      )}
      aria-label={`Remove ${removeLabel}`}
    >
      <span className="truncate">{label}</span>
      <X aria-hidden="true" className="h-3 w-3 text-text-subtle" />
    </button>
  );
}

export const NOTE_FINDER_RESULTS_ID = 'note-finder-results';

/**
 * The finder's result list, driven from the search box while focus stays there. Result rows hold
 * their own controls, so they are not listbox options; the highlight is announced instead.
 */
export type NoteFinderResults = {
  activeId?: string;
  /** What a screen reader hears when the highlight moves, such as "Plan, 2 of 5. Enter opens it." */
  announcement: string;
  move: (step: 1 | -1) => void;
  open: () => void;
};

export function NoteFinderToolbar({
  state,
  selectedFolderId,
  options,
  onChange,
  results,
  tags,
  onTagToggle,
  onEscapeToTree,
}: {
  state: NoteFinderState;
  selectedFolderId: string | null;
  options: ReturnType<typeof getNoteFinderOptions>;
  onChange: (state: NoteFinderState) => void;
  results?: NoteFinderResults;
  /** Tags across the workspace, offered as filters in View options. */
  tags: ElectronNoteTag[];
  onTagToggle: (tag: string) => void;
  onEscapeToTree: () => void;
}) {
  // Filters, plus a scope or order that differs from the default.
  const viewOptionCount = getActiveNoteFinderFilterCount(state)
    + (state.searchScope === DEFAULT_NOTE_FINDER_STATE.searchScope ? 0 : 1)
    + (state.sortMode === DEFAULT_NOTE_FINDER_STATE.sortMode ? 0 : 1);
  const currentFolderDisabled = !selectedFolderId;
  const updateState = (patch: Partial<NoteFinderState>) => onChange({ ...state, ...patch });
  const removeTag = (tag: string) => updateState({ tagFilters: state.tagFilters.filter((candidate) => candidate !== tag) });
  const removeReadPermission = (permission: NotePermissionRole) => updateState({
    readPermissionFilters: state.readPermissionFilters.filter((candidate) => candidate !== permission),
  });
  const removeWritePermission = (permission: NotePermissionRole) => updateState({
    writePermissionFilters: state.writePermissionFilters.filter((candidate) => candidate !== permission),
  });
  const clearFilters = () => onChange(clearNoteFinderFilters(state));
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const step = event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n') ? 1
      : event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p') ? -1 : 0;
    if (step && results) {
      event.preventDefault();
      results.move(step);
      return;
    }
    if (event.key === 'ArrowDown' && !results) {
      // Without a search, the tree is the list: Down moves into it.
      event.preventDefault();
      onEscapeToTree();
      return;
    }
    if (event.key === 'Enter' && results?.activeId) {
      event.preventDefault();
      results.open();
      return;
    }
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (state.query) {
      onChange(clearNoteFinderQuery(state));
      return;
    }

    if (hasActiveNoteFinderFilters(state)) {
      onChange(clearNoteFinderFilters(state));
      return;
    }

    onEscapeToTree();
  };
  const searchShortcut = useActionShortcut('search-notes');

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border-default bg-background-default px-2 transition focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-focus-ring/60">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-text-subtle" />
          <span className="sr-only">Search notes</span>
          <input
            name="noteSearch"
            aria-controls={results ? NOTE_FINDER_RESULTS_ID : undefined}
            value={state.query}
            onChange={(event) => updateState({ query: event.target.value })}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search notes"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {searchShortcut ? <kbd aria-hidden="true" data-search-shortcut className="shrink-0 rounded border border-border-default px-1 text-xs text-text-subtle">{searchShortcut}</kbd> : null}
          {state.query ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => updateState({ query: '' })}
              aria-label="Clear search"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </label>
        <span role="status" aria-live="polite" className="sr-only">{results?.announcement}</span>

        <Toolbar aria-label="Note finder controls" className="gap-1.5">
          {/* One menu holds where to search, the order, and every filter, so the bar stays quiet. */}
          <DropdownMenu>
            <ToolbarDropdownIconTrigger
              label="View options"
              tooltip={viewOptionCount ? `View options · ${viewOptionCount} changed` : 'View options'}
              className={cn('relative h-8 w-8', viewOptionCount && 'bg-background-selected text-text-default')}
            >
              <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
              {viewOptionCount ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-default px-1 text-2xs leading-none text-primary-foreground">
                  {viewOptionCount}
                </span>
              ) : null}
            </ToolbarDropdownIconTrigger>
            <DropdownMenuContent align="end" className="max-h-96 min-w-56 overflow-auto">
              <DropdownMenuLabel>Search In</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => updateState({ searchScope: 'workspace' })}>
                <CheckedIcon checked={state.searchScope === 'workspace'} />
                Workspace
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={currentFolderDisabled}
                onSelect={() => updateState({ searchScope: 'current-folder' })}
              >
                <CheckedIcon checked={state.searchScope === 'current-folder'} />
                Current Folder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Sort</DropdownMenuLabel>
              {SORT_MODES.map((sortMode) => (
                <DropdownMenuItem key={sortMode} onSelect={() => updateState({ sortMode })}>
                  <CheckedIcon checked={state.sortMode === sortMode} />
                  {SORT_LABELS[sortMode]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Read Permission</DropdownMenuLabel>
              {options.readPermissions.map((permission) => (
                <DropdownMenuCheckboxItem
                  key={`read:${permission}`}
                  checked={state.readPermissionFilters.includes(permission)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => updateState({ readPermissionFilters: togglePermissionFilter(state.readPermissionFilters, permission) })}
                >
                  {PERMISSION_LABELS[permission]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Write Permission</DropdownMenuLabel>
              {options.writePermissions.map((permission) => (
                <DropdownMenuCheckboxItem
                  key={`write:${permission}`}
                  checked={state.writePermissionFilters.includes(permission)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => updateState({ writePermissionFilters: togglePermissionFilter(state.writePermissionFilters, permission) })}
                >
                  {PERMISSION_LABELS[permission]}
                </DropdownMenuCheckboxItem>
              ))}
              {tags.length ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Tags</DropdownMenuLabel>
                  {tags.map((entry) => (
                    <DropdownMenuCheckboxItem
                      key={`tag:${entry.tag}`}
                      checked={state.tagFilters.includes(entry.tag)}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={() => onTagToggle(entry.tag)}
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.tag}</span>
                      <span className="shrink-0 tabular-nums text-text-subtle">{entry.count}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              ) : null}
              {hasActiveNoteFinderFilters(state) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={clearFilters}>
                    Clear Filters
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </Toolbar>
      </div>

      {hasActiveNoteFinderFilters(state) ? (
        <div className="flex items-start gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {state.tagFilters.map((tag) => (
              <FilterChip key={`tag:${tag}`} label={tag} removeLabel={`tag filter ${tag}`} onRemove={() => removeTag(tag)} />
            ))}
            {state.readPermissionFilters.map((permission) => (
              <FilterChip key={`read:${permission}`} label={`Read: ${PERMISSION_LABELS[permission]}`} removeLabel={`read permission filter ${PERMISSION_LABELS[permission]}`} onRemove={() => removeReadPermission(permission)} />
            ))}
            {state.writePermissionFilters.map((permission) => (
              <FilterChip key={`write:${permission}`} label={`Write: ${PERMISSION_LABELS[permission]}`} removeLabel={`write permission filter ${PERMISSION_LABELS[permission]}`} onRemove={() => removeWritePermission(permission)} />
            ))}
          </div>
          <Button variant="ghost" size="xs" onClick={clearFilters} className="font-normal">
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}
