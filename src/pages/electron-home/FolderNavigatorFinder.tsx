import { useActionShortcut } from './ActionShortcutContext';
import {
  Check,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';
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

import { FOCUS_RING_CLASS, FOCUS_RING_INSET_CLASS } from './ui';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  /** How many notes match, shown in the search field while searching. */
  count: number;
  move: (step: 1 | -1) => void;
  open: () => void;
};

/** How many view options differ from the default: filters, plus a changed scope or order. */
export function getViewOptionCount(state: NoteFinderState) {
  return getActiveNoteFinderFilterCount(state)
    + (state.searchScope === DEFAULT_NOTE_FINDER_STATE.searchScope ? 0 : 1)
    + (state.sortMode === DEFAULT_NOTE_FINDER_STATE.sortMode ? 0 : 1);
}

/**
 * The sidebar search, collapsed to an icon in the header until it's wanted. Clicking it or the
 * search shortcut (/) opens it across the header row; it stays open while it holds text, and closes
 * again once empty and left. The field is always mounted, so focusing it is all it takes to open.
 */
export function NoteSearchField({
  state,
  onChange,
  results,
  onEscapeToTree,
}: {
  state: NoteFinderState;
  onChange: (state: NoteFinderState) => void;
  results?: NoteFinderResults;
  onEscapeToTree: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const open = focused || state.query.length > 0;
  const updateState = (patch: Partial<NoteFinderState>) => onChange({ ...state, ...patch });
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

    // Then the filters, so Escape steps all the way back to the plain tree.
    if (hasActiveNoteFinderFilters(state)) {
      onChange(clearNoteFinderFilters(state));
      return;
    }

    onEscapeToTree();
  };
  const searchShortcut = useActionShortcut('search-notes');

  return (
    <>
      <label
        data-search-open={open || undefined}
        title={open ? undefined : searchShortcut ? `Search notes (${searchShortcut})` : 'Search notes'}
        className={cn(
          'flex h-8 shrink-0 items-center rounded-md border transition-colors',
          open
            // Open: across the whole header row, over the workspace name, out to the same 8px edges
            // as New Note below it.
            ? 'absolute inset-y-0 -left-2 -right-2 z-10 gap-2 border-border-default bg-background-default pl-1.75 pr-2 focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-focus-ring/60'
            // Closed: an icon button at the row's end, its box on New Note's edge.
            : 'relative -mr-2 w-8 justify-center border-transparent text-icon-default hover:bg-background-hover',
        )}
      >
        <Search aria-hidden="true" className={cn('h-4 w-4 shrink-0', open && 'text-text-subtle')} />
        <span className="sr-only">Search notes</span>
        <input
          name="noteSearch"
          aria-controls={results ? NOTE_FINDER_RESULTS_ID : undefined}
          value={state.query}
          onChange={(event) => updateState({ query: event.target.value })}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search notes"
          enterKeyHint="search"
          // Closed, the field covers the icon with transparent text: a click lands in it, opening search, and
          // navigation hints and the keyboard reach it like any other target.
          className={cn('min-w-0 bg-transparent text-sm outline-none', open ? 'flex-1' : 'absolute inset-0 size-full cursor-pointer text-transparent caret-transparent placeholder:text-transparent')}
        />
        {/* The result count is on the list's header row, beside View options. */}
        {open && !state.query && searchShortcut ? (
          <kbd aria-hidden="true" data-search-shortcut className="shrink-0 rounded border border-border-default px-1 text-xs text-text-subtle">{searchShortcut}</kbd>
        ) : null}
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
    </>
  );
}

/**
 * How the workspace's notes are listed: where to search, the order, and filters. Changing any of
 * them lists the notes flat instead of as the tree. It sits on the list's own header row (the
 * workspace root, or the results header).
 */
export function NoteViewOptionsMenu({
  state,
  selectedFolderId,
  options,
  onChange,
  tags,
  className,
  tabIndex,
  treeControl = false,
}: {
  state: NoteFinderState;
  selectedFolderId: string | null;
  options: ReturnType<typeof getNoteFinderOptions>;
  onChange: (state: NoteFinderState) => void;
  /** Tags across the workspace, offered as filters. */
  tags: ElectronNoteTag[];
  className?: string;
  tabIndex?: number;
  /** On a tree row: the tree's arrow keys leave it alone, like the row's other controls. */
  treeControl?: boolean;
}) {
  const viewOptionCount = getViewOptionCount(state);
  const currentFolderDisabled = !selectedFolderId;
  const updateState = (patch: Partial<NoteFinderState>) => onChange({ ...state, ...patch });
  const toggleTag = (tag: string) => onChange({
    ...state,
    searchScope: 'workspace',
    tagFilters: state.tagFilters.includes(tag) ? state.tagFilters.filter((candidate) => candidate !== tag) : [...state.tagFilters, tag],
  });

  return (
    <DropdownMenu>
      <TooltipRoot>
        <TooltipTrigger
          render={(
            <DropdownMenuTrigger
              render={(
                <button
                  type="button"
                  aria-label="View options"
                  tabIndex={tabIndex}
                  data-folder-tree-ignore-keyboard={treeControl || undefined}
                  className={cn(
                    'relative flex size-7 items-center justify-center rounded text-icon-subtle hover:text-text-default',
                    FOCUS_RING_INSET_CLASS,
                    viewOptionCount && 'bg-background-selected text-text-default',
                    className,
                  )}
                />
              )}
            >
              <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
              {viewOptionCount ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-default px-1 text-2xs leading-none text-primary-foreground">
                  {viewOptionCount}
                </span>
              ) : null}
            </DropdownMenuTrigger>
          )}
        />
        <TooltipContent side="bottom">{viewOptionCount ? `View options · ${viewOptionCount} changed` : 'View options'}</TooltipContent>
      </TooltipRoot>
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
                onCheckedChange={() => toggleTag(entry.tag)}
              >
                <span className="min-w-0 flex-1 truncate">{entry.tag}</span>
                <span className="shrink-0 tabular-nums text-text-subtle">{entry.count}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}
        {viewOptionCount ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange({ ...clearNoteFinderFilters(state), searchScope: DEFAULT_NOTE_FINDER_STATE.searchScope, sortMode: DEFAULT_NOTE_FINDER_STATE.sortMode })}>
              Reset View
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The active filters as removable chips, under the list's header row. */
export function NoteFilterChips({
  state,
  onChange,
}: {
  state: NoteFinderState;
  onChange: (state: NoteFinderState) => void;
}) {
  if (!hasActiveNoteFinderFilters(state)) return null;
  const updateState = (patch: Partial<NoteFinderState>) => onChange({ ...state, ...patch });
  return (
    <div className="flex items-start gap-1.5 px-2 pb-1">
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
        {state.tagFilters.map((tag) => (
          <FilterChip key={`tag:${tag}`} label={tag} removeLabel={`tag filter ${tag}`} onRemove={() => updateState({ tagFilters: state.tagFilters.filter((candidate) => candidate !== tag) })} />
        ))}
        {state.readPermissionFilters.map((permission) => (
          <FilterChip key={`read:${permission}`} label={`Read: ${PERMISSION_LABELS[permission]}`} removeLabel={`read permission filter ${PERMISSION_LABELS[permission]}`} onRemove={() => updateState({ readPermissionFilters: state.readPermissionFilters.filter((candidate) => candidate !== permission) })} />
        ))}
        {state.writePermissionFilters.map((permission) => (
          <FilterChip key={`write:${permission}`} label={`Write: ${PERMISSION_LABELS[permission]}`} removeLabel={`write permission filter ${PERMISSION_LABELS[permission]}`} onRemove={() => updateState({ writePermissionFilters: state.writePermissionFilters.filter((candidate) => candidate !== permission) })} />
        ))}
      </div>
      <Button variant="ghost" size="xs" onClick={() => onChange(clearNoteFinderFilters(state))} className="font-normal">
        Clear
      </Button>
    </div>
  );
}
