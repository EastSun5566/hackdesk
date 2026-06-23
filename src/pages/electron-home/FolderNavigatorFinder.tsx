import {
  ArrowDownUp,
  Check,
  FileText,
  FolderOpen,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react';
import { useState } from 'react';

import type { NotePermissionRole } from '@/lib/electron-api';
import {
  getActiveNoteFinderFilterCount,
  getNoteFinderOptions,
  hasActiveNoteFinderFilters,
  togglePermissionFilter,
  toggleStringFilter,
  type NoteFinderSortMode,
  type NoteFinderState,
} from '@/lib/electron-note-finder';
import type { ElectronNoteTag } from '@/lib/electron-note-tags';
import { cn } from '@/lib/utils';

import { CollapsibleSection, EntityRow, ToolbarDropdownIconTrigger } from './interaction-primitives';
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
const TAG_BROWSER_LIMIT = 6;

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
        'inline-flex h-7 min-w-0 items-center gap-1 rounded-[6px] border border-border-default bg-background-default px-2 text-xs text-text-default transition-colors hover:bg-element-bg-hover',
        FOCUS_RING_CLASS,
      )}
      aria-label={`Remove ${removeLabel}`}
    >
      <span className="truncate">{label}</span>
      <X aria-hidden="true" className="h-3 w-3 text-text-subtle" />
    </button>
  );
}

export function NoteFinderToolbar({
  state,
  selectedFolderId,
  options,
  onChange,
}: {
  state: NoteFinderState;
  selectedFolderId: string | null;
  options: ReturnType<typeof getNoteFinderOptions>;
  onChange: (state: NoteFinderState) => void;
}) {
  const activeFilterCount = getActiveNoteFinderFilterCount(state);
  const currentFolderDisabled = !selectedFolderId;
  const updateState = (patch: Partial<NoteFinderState>) => onChange({ ...state, ...patch });
  const removeTag = (tag: string) => updateState({ tagFilters: state.tagFilters.filter((candidate) => candidate !== tag) });
  const removeReadPermission = (permission: NotePermissionRole) => updateState({
    readPermissionFilters: state.readPermissionFilters.filter((candidate) => candidate !== permission),
  });
  const removeWritePermission = (permission: NotePermissionRole) => updateState({
    writePermissionFilters: state.writePermissionFilters.filter((candidate) => candidate !== permission),
  });
  const scopeLabel = state.searchScope === 'workspace' ? 'Workspace' : 'Current Folder';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border-default bg-background-default px-2 transition-[border-color,box-shadow] focus-within:border-primary-default focus-within:ring-2 focus-within:ring-primary-default/60">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-text-subtle" />
          <span className="sr-only">Search notes</span>
          <input
            name="noteSearch"
            value={state.query}
            onChange={(event) => updateState({ query: event.target.value })}
            placeholder="Search notes"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {state.query ? (
            <button
              type="button"
              onClick={() => updateState({ query: '' })}
              className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-subtle hover:text-text-default', FOCUS_RING_CLASS)}
              aria-label="Clear search"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>

        <DropdownMenu>
          <ToolbarDropdownIconTrigger label="Search scope" tooltip={`Scope: ${scopeLabel}`} className="h-8 w-8">
            {state.searchScope === 'current-folder'
              ? <FolderOpen aria-hidden="true" className="h-4 w-4" />
              : <FileText aria-hidden="true" className="h-4 w-4" />}
          </ToolbarDropdownIconTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Search Scope</DropdownMenuLabel>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <ToolbarDropdownIconTrigger label="Sort notes" tooltip={SORT_LABELS[state.sortMode]} className="h-8 w-8">
            <ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5" />
          </ToolbarDropdownIconTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort</DropdownMenuLabel>
            {SORT_MODES.map((sortMode) => (
              <DropdownMenuItem key={sortMode} onSelect={() => updateState({ sortMode })}>
                <CheckedIcon checked={state.sortMode === sortMode} />
                {SORT_LABELS[sortMode]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <ToolbarDropdownIconTrigger
            label="Filter notes"
            tooltip={activeFilterCount ? `${activeFilterCount} active filters` : 'Filter notes'}
            className={cn('relative h-8 w-8', activeFilterCount && 'bg-background-selected text-text-default')}
          >
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            {activeFilterCount ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-default px-1 text-[10px] leading-none text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </ToolbarDropdownIconTrigger>
          <DropdownMenuContent align="end" className="max-h-96 min-w-56 overflow-auto">
            <DropdownMenuLabel>Tags</DropdownMenuLabel>
            {options.tags.length > 0 ? options.tags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={state.tagFilters.includes(tag)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => updateState({ tagFilters: toggleStringFilter(state.tagFilters, tag) })}
              >
                {tag}
              </DropdownMenuCheckboxItem>
            )) : (
              <DropdownMenuItem disabled>No tags loaded</DropdownMenuItem>
            )}
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
            {hasActiveNoteFinderFilters(state) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => updateState({
                  tagFilters: [],
                  readPermissionFilters: [],
                  writePermissionFilters: [],
                })}
                >
                  Clear Filters
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasActiveNoteFinderFilters(state) ? (
        <div className="flex flex-wrap gap-1.5">
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
      ) : null}
    </div>
  );
}

export function TagBrowser({
  tags,
  activeTags,
  isLoading,
  onTagToggle,
}: {
  tags: ElectronNoteTag[];
  activeTags: string[];
  isLoading: boolean;
  onTagToggle: (tag: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleTags = showAll ? tags : tags.slice(0, TAG_BROWSER_LIMIT);

  if (isLoading) {
    return null;
  }

  if (tags.length === 0 && activeTags.length === 0) {
    return null;
  }

  return (
    <CollapsibleSection
      key={activeTags.length > 0 ? 'tags-active' : 'tags-idle'}
      title="Tags"
      subtitle={tags.length > 0 ? String(tags.length) : undefined}
      defaultOpen={activeTags.length > 0}
      className="border-b-0 py-0.5"
      contentClassName="space-y-0.5 pt-0.5"
    >
      {tags.length === 0 ? (
        <div className="rounded-md border border-border-default bg-background-default px-2 py-1.5 text-xs text-text-subtle">
          No tags yet
        </div>
      ) : (
        <div className="space-y-1">
          {visibleTags.map((entry) => {
            const active = activeTags.includes(entry.tag);
            return (
              <EntityRow
                key={entry.tag}
                selected={active}
                active={active}
                variant="compact"
                icon={<Tag className="h-3.5 w-3.5" />}
                title={entry.tag}
                trailing={entry.count}
                className="h-7 py-0 text-xs"
                ariaLabel={`${active ? 'Clear' : 'Filter by'} tag ${entry.tag}`}
                onClick={() => onTagToggle(entry.tag)}
              />
            );
          })}
          {tags.length > TAG_BROWSER_LIMIT ? (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className={cn(
                'mt-0.5 h-7 rounded-[6px] px-2 text-xs text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default',
                FOCUS_RING_CLASS,
              )}
            >
              {showAll ? 'Show less' : `Show ${tags.length - TAG_BROWSER_LIMIT} more`}
            </button>
          ) : null}
        </div>
      )}
    </CollapsibleSection>
  );
}
