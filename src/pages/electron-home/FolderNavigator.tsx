import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  Search,
} from 'lucide-react';

import type { NoteSummary } from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';
import { UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';

import type { WorkspaceScope } from './types';
import { RepositoryNotice } from './RepositoryNotice';
import {
  FOCUS_RING_CLASS,
  ICON_BUTTON_CLASS,
  formatDate,
  getFolderTotalNoteCount,
} from './ui';

function NoteRow({
  entry,
  selected,
  onSelect,
  compact = false,
}: {
  entry: FolderTreeNote;
  selected: boolean;
  onSelect: (note: NoteSummary) => void;
  compact?: boolean;
}) {
  const metadata = [
    entry.folderLabel,
    entry.note.tags.slice(0, 2).join(', '),
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.note)}
      className={`flex w-full min-w-0 items-start text-left transition-colors ${
        selected ? 'bg-primary-soft text-text-default' : 'hover:bg-background-selected'
      } ${FOCUS_RING_CLASS} ${compact ? 'gap-2 rounded-[6px] px-2 py-1.5' : 'gap-3 rounded-md px-3 py-2.5'}`}
    >
      <FileText className={`${compact ? 'mt-0.5 h-3.5 w-3.5' : 'mt-0.5 h-4 w-4'} shrink-0 text-text-subtle`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{entry.note.title || 'Untitled'}</span>
        <span className="mt-1 block truncate text-xs text-text-subtle">{metadata || entry.note.shortId}</span>
      </span>
      <span className="shrink-0 text-xs text-text-subtle">{formatDate(entry.note.updatedAtMillis)}</span>
    </button>
  );
}

function FolderButton({
  node,
  selected,
  collapsed,
  onSelect,
  onToggle,
}: {
  node: FolderTreeNode;
  selected: boolean;
  collapsed: boolean;
  onSelect: (folderId: string) => void;
  onToggle: (folderId: string) => void;
}) {
  const hasChildren = node.children.length > 0 || node.notes.length > 0;
  const totalNotes = getFolderTotalNoteCount(node);

  return (
    <div
      className={`group flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-sm transition-colors ${
        selected ? 'bg-background-selected text-text-default' : 'text-text-subtle hover:bg-background-selected hover:text-text-default'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        disabled={!hasChildren}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-subtle hover:text-text-default ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-0`}
        aria-label={collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-[4px] text-left ${FOCUS_RING_CLASS}`}
      >
        {collapsed ? <Folder className="h-3.5 w-3.5 shrink-0" /> : <FolderOpen className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
      <span className="shrink-0 text-xs text-text-subtle">{totalNotes}</span>
    </div>
  );
}

function FolderTreeView({
  nodes,
  selectedFolderId,
  selectedNoteId,
  collapsedFolderIds,
  depth,
  onFolderSelect,
  onFolderToggle,
  onNoteSelect,
}: {
  nodes: FolderTreeNode[];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  collapsedFolderIds: Set<string>;
  depth: number;
  onFolderSelect: (folderId: string) => void;
  onFolderToggle: (folderId: string) => void;
  onNoteSelect: (note: NoteSummary) => void;
}) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className={`grid gap-0.5 ${depth > 0 ? 'relative pl-5' : ''}`}>
      {depth > 0 ? <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border-default/70" aria-hidden="true" /> : null}
      {nodes.map((node) => {
        const collapsed = collapsedFolderIds.has(node.id);

        return (
          <div key={node.id} className="min-w-0">
            <FolderButton
              node={node}
              selected={selectedFolderId === node.id}
              collapsed={collapsed}
              onSelect={onFolderSelect}
              onToggle={onFolderToggle}
            />
            {!collapsed ? (
              <div className="mt-0.5 grid gap-0.5">
                <FolderTreeView
                  nodes={node.children}
                  selectedFolderId={selectedFolderId}
                  selectedNoteId={selectedNoteId}
                  collapsedFolderIds={collapsedFolderIds}
                  depth={depth + 1}
                  onFolderSelect={onFolderSelect}
                  onFolderToggle={onFolderToggle}
                  onNoteSelect={onNoteSelect}
                />
                {node.notes.map((entry) => (
                  <div key={`${node.id}:${entry.note.id}`} className="relative pl-5">
                    <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border-default/70" aria-hidden="true" />
                    <NoteRow
                      entry={entry}
                      selected={entry.note.id === selectedNoteId}
                      onSelect={onNoteSelect}
                      compact
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function FolderNavigator({
  scope,
  tree,
  entries,
  selectedFolderId,
  selectedNoteId,
  search,
  isLoading,
  hasToken,
  collapsed,
  width,
  collapsedFolderIds,
  emptyTitle,
  emptyDescription,
  activeError,
  showingCachedFallback,
  canCreate,
  isFetching,
  isCreating,
  onFolderSelect,
  onFolderToggle,
  onNoteSelect,
  onSearchChange,
  onRefresh,
  onCreate,
  onCreateFolder,
  onToggleCollapsed,
  onOpenPalette,
  onOpenSettings,
}: {
  scope: WorkspaceScope;
  tree: FolderTree;
  entries: FolderTreeNote[];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  search: string;
  isLoading: boolean;
  hasToken: boolean;
  collapsed: boolean;
  width: number;
  collapsedFolderIds: Set<string>;
  emptyTitle: string;
  emptyDescription: string;
  activeError: string | null;
  showingCachedFallback: boolean;
  canCreate: boolean;
  isFetching: boolean;
  isCreating: boolean;
  onFolderSelect: (folderId: string | null) => void;
  onFolderToggle: (folderId: string) => void;
  onNoteSelect: (note: NoteSummary) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onCreateFolder: () => void;
  onToggleCollapsed: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}) {
  const isSearching = search.trim().length > 0;
  const hasTreeContent = tree.roots.length > 0 || tree.unfiled.notes.length > 0;

  if (collapsed) {
    return (
      <section className="flex w-12 shrink-0 flex-col items-center border-r border-border-default bg-background-muted pt-4">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={ICON_BUTTON_CLASS}
          aria-label="Expand note navigator"
          title="Expand note navigator"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </section>
    );
  }

  return (
    <section
      data-hackdesk-focus="navigator"
      tabIndex={-1}
      className="flex shrink-0 flex-col border-r border-border-default bg-background-muted outline-none"
      style={{ width }}
    >
      <header className="space-y-3 border-b border-border-default px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{scope.label}</h2>
            <p className="text-xs text-text-subtle">{entries.length} notes</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefresh}
              className={ICON_BUTTON_CLASS}
              aria-label="Refresh notes"
            >
              <RefreshCcw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onCreate}
              disabled={!canCreate || isCreating}
              className={ICON_BUTTON_CLASS}
              aria-label="Create note"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCreateFolder}
              disabled={!canCreate || isCreating}
              className={ICON_BUTTON_CLASS}
              aria-label="Create folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onOpenPalette}
              className={ICON_BUTTON_CLASS}
              aria-label="Open command palette"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={ICON_BUTTON_CLASS}
              aria-label="Collapse note navigator"
              title="Collapse note navigator"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <label className="flex h-10 items-center gap-2 rounded-md border border-border-default bg-background-default px-3 transition-colors focus-within:border-primary-default">
          <Search className="h-4 w-4 text-text-subtle" />
          <span className="sr-only">Search notes</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search notes"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>

        {!hasToken ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className={`flex w-full items-center gap-2 rounded-md border border-border-default bg-background-default px-3 py-2 text-left text-sm text-text-subtle transition-colors hover:bg-background-selected hover:text-text-default ${FOCUS_RING_CLASS}`}
          >
            <AlertCircle className="h-4 w-4" />
            Configure HackMD API token
          </button>
        ) : null}

        <RepositoryNotice error={activeError} cached={showingCachedFallback} />
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-subtle">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading notes
          </div>
        ) : entries.length === 0 && (!hasTreeContent || isSearching) ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-64 space-y-2">
              <FileText className="mx-auto h-7 w-7 text-text-subtle" />
              <p className="text-sm font-medium text-text-default">{emptyTitle}</p>
              <p className="text-xs leading-5 text-text-subtle">{emptyDescription}</p>
            </div>
          </div>
        ) : isSearching ? (
          <div className="space-y-1">
            {entries.map((entry) => (
              <NoteRow
                key={`${entry.folderLabel}:${entry.note.id}`}
                entry={entry}
                selected={entry.note.id === selectedNoteId}
                onSelect={onNoteSelect}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-0.5">
            <FolderTreeView
              nodes={tree.roots}
              selectedFolderId={selectedFolderId}
              selectedNoteId={selectedNoteId}
              collapsedFolderIds={collapsedFolderIds}
              depth={0}
              onFolderSelect={onFolderSelect}
              onFolderToggle={onFolderToggle}
              onNoteSelect={onNoteSelect}
            />
            {tree.unfiled.notes.map((entry) => (
              <NoteRow
                key={`root:${entry.note.id}`}
                entry={entry}
                selected={entry.note.id === selectedNoteId}
                onSelect={onNoteSelect}
                compact
              />
            ))}
            {tree.roots.length === 0 && tree.unfiled.notes.length === 0 ? (
              <button
                type="button"
                onClick={() => onFolderSelect(UNFILED_FOLDER_ID)}
                className={`flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-sm text-text-subtle hover:bg-background-selected hover:text-text-default ${FOCUS_RING_CLASS}`}
              >
                <Folder className="h-3.5 w-3.5" />
                Root
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
