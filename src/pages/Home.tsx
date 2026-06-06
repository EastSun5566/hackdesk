import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileText,
  Folder,
  FolderOpen,
  History,
  Lock,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { MarkdownEditor } from '@/components/MarkdownEditor';
import { getHackDeskAPI } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import type {
  DocumentSummary,
  ElectronSafeSettings,
  FolderPathSummary,
  NoteSummary,
  RepositoryValue,
  TeamSummary,
} from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode, FolderTreeNote } from '@/lib/hackmd-folders';

type WorkspaceScope =
  | { type: 'personal'; label: string }
  | { type: 'history'; label: string }
  | { type: 'team'; label: string; teamPath: string };

type CommandPaletteState = {
  open: boolean;
  search: string;
};

type CreateNoteDialogState = {
  open: boolean;
  title: string;
};

const EMPTY_NOTES: NoteSummary[] = [];
const EMPTY_TEAMS: TeamSummary[] = [];
const RAIL_COLLAPSED_KEY = 'hackdesk_rail_collapsed';
const NAVIGATOR_COLLAPSED_KEY = 'hackdesk_navigator_collapsed';
const FOLDER_COLLAPSED_PREFIX = 'hackdesk_folder_collapsed:';
const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default';
const PRESSED_CLASS = 'active:translate-y-px';
const ICON_BUTTON_CLASS = `inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-background-selected hover:text-text-default ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`;
const COMPACT_ICON_BUTTON_CLASS = `inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-text-subtle transition-colors hover:bg-background-selected hover:text-text-default ${PRESSED_CLASS} ${FOCUS_RING_CLASS}`;
const SECONDARY_BUTTON_CLASS = `inline-flex h-9 items-center gap-2 rounded-md border border-border-default px-3 text-sm transition-colors active:bg-background-selected ${PRESSED_CLASS} ${FOCUS_RING_CLASS}`;
const PRIMARY_BUTTON_CLASS = `inline-flex h-9 items-center gap-2 rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`;
const TEXT_INPUT_CLASS = 'h-10 w-full rounded-md border border-border-default bg-background-muted px-3 text-sm outline-none transition-colors focus:border-primary-default';

function unwrapRepositoryValue<T>(value?: RepositoryValue<T>) {
  if (!value || value.source === 'error') {
    return value?.data;
  }

  return value.data;
}

function getRepositoryError<T>(value?: RepositoryValue<T>) {
  return value?.source === 'error' ? value.error : null;
}

function isShowingCachedFallback<T>(value?: RepositoryValue<T>) {
  return value?.source === 'error' && value.data !== undefined;
}

function formatDate(millis: number | null) {
  if (!millis) {
    return 'No date';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(millis));
}

function createQuickNoteContent(title: string) {
  return `# ${title}\n\n`;
}

function getWorkspaceQueryKey(scope: WorkspaceScope) {
  if (scope.type === 'team') {
    return ['electron', 'hackmd', 'team-notes', scope.teamPath] as const;
  }

  return ['electron', 'hackmd', scope.type === 'history' ? 'history' : 'notes'] as const;
}

function getScopeStorageKey(scope: WorkspaceScope) {
  return scope.type === 'team' ? `team:${scope.teamPath}` : scope.type;
}

function isTokenConfigured(settings?: ElectronSafeSettings) {
  return settings?.hasHackmdApiToken === true;
}

function readBooleanStorage(key: string, fallback: boolean) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  return window.localStorage.getItem(key) === null
    ? fallback
    : window.localStorage.getItem(key) === 'true';
}

function writeBooleanStorage(key: string, value: boolean) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, String(value));
  }
}

function readStringArrayStorage(key: string) {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function writeStringArrayStorage(key: string, value: Set<string>) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, JSON.stringify([...value]));
  }
}

function getFolderPathLabel(path: FolderPathSummary[]) {
  return path.length > 0 ? path.map((folder) => folder.name).join(' / ') : '';
}

function noteMatchesSearch(entry: FolderTreeNote, search: string) {
  const text = [
    entry.note.title,
    entry.note.description,
    entry.note.shortId,
    entry.note.teamPath,
    entry.note.userPath,
    entry.folderLabel,
    ...entry.note.tags,
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes(search);
}

function getFolderNoteEntries(tree: FolderTree, selectedFolderId: string | null): FolderTreeNote[] {
  if (!selectedFolderId) {
    return tree.allNotes;
  }

  if (selectedFolderId === UNFILED_FOLDER_ID) {
    return tree.unfiled.notes;
  }

  return tree.nodesById.get(selectedFolderId)?.notes ?? [];
}

function getFolderTotalNoteCount(node: FolderTreeNode): number {
  return node.notes.length + node.children.reduce((total, child) => total + getFolderTotalNoteCount(child), 0);
}

function RepositoryNotice({
  error,
  cached,
}: {
  error: string | null;
  cached: boolean;
}) {
  if (!error) {
    return null;
  }

  return (
    <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
      cached
        ? 'bg-primary-soft text-primary-default'
        : 'bg-destructive-soft text-destructive-default'
    }`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{cached ? `Showing cached data. ${error}` : error}</span>
    </div>
  );
}

function DialogShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background-overlay px-4 pt-28">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`dialog-${title.toLowerCase().replace(/\s+/g, '-')}`}
        className="w-full max-w-md rounded-lg border border-border-default bg-background-default shadow-lg"
      >
        <div className="border-b border-border-default px-5 py-4">
          <h2 id={`dialog-${title.toLowerCase().replace(/\s+/g, '-')}`} className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-text-subtle">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateNoteDialog({
  state,
  scopeLabel,
  folderLabel,
  isCreating,
  onStateChange,
  onCancel,
  onCreate,
}: {
  state: CreateNoteDialogState;
  scopeLabel: string;
  folderLabel: string | null;
  isCreating: boolean;
  onStateChange: (state: CreateNoteDialogState) => void;
  onCancel: () => void;
  onCreate: (title: string) => void;
}) {
  if (!state.open) {
    return null;
  }

  const normalizedTitle = state.title.trim();
  const location = folderLabel ? `${scopeLabel} / ${folderLabel}` : scopeLabel;

  return (
    <DialogShell
      title="New Note"
      description={`Create a note in ${location}.`}
    >
      <form
        className="space-y-5 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (normalizedTitle) {
            onCreate(normalizedTitle);
          }
        }}
      >
        <label className="block space-y-2 text-sm">
          <span className="font-medium">Title</span>
          <input
            autoFocus
            value={state.title}
            onChange={(event) => onStateChange({ ...state, title: event.target.value })}
            className={TEXT_INPUT_CLASS}
            placeholder="Sprint notes"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!normalizedTitle || isCreating}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function DeleteNoteDialog({
  note,
  isDeleting,
  onCancel,
  onDelete,
}: {
  note: DocumentSummary | null;
  isDeleting: boolean;
  onCancel: () => void;
  onDelete: (note: DocumentSummary) => void;
}) {
  if (!note) {
    return null;
  }

  return (
    <DialogShell
      title="Delete Note"
      description="This removes the note from HackMD. This action cannot be undone from HackDesk."
    >
      <div className="space-y-5 p-5">
        <div className="rounded-md border border-border-default bg-background-muted px-3 py-2 text-sm">
          <p className="truncate font-medium">{note.title || 'Untitled'}</p>
          <p className="mt-1 text-xs text-text-subtle">{note.teamPath ? `@${note.teamPath}` : 'My Workspace'}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => onDelete(note)}
            className={`inline-flex h-9 items-center gap-2 rounded-md border border-destructive-default px-3 text-sm font-medium text-destructive-default transition-colors active:bg-destructive-soft ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

function SettingsPanel({
  settings,
  isSaving,
  onSave,
  onClose,
}: {
  settings?: ElectronSafeSettings;
  isSaving: boolean;
  onSave: (input: { title: string; hackmdApiToken?: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(settings?.title ?? 'HackDesk');
  const [token, setToken] = useState('');

  useEffect(() => {
    setTitle(settings?.title ?? 'HackDesk');
  }, [settings?.title]);

  return (
    <DialogShell title="Settings">
      <form
        className="space-y-5 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) {
            onSave({
              title: title.trim(),
              ...(token.trim() ? { hackmdApiToken: token.trim() } : {}),
            });
          }
        }}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md px-2 py-1 text-sm text-text-subtle transition-colors hover:bg-background-selected hover:text-text-default ${FOCUS_RING_CLASS}`}
          >
            Close
          </button>
        </div>

        <label className="block space-y-2 text-sm">
          <span className="font-medium">Window Title</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={TEXT_INPUT_CLASS}
          />
        </label>

        <label className="block space-y-2 text-sm">
          <span className="font-medium">HackMD API Token</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder={settings?.hasHackmdApiToken ? 'Token configured' : 'Paste token'}
            className={TEXT_INPUT_CLASS}
          />
        </label>

        <button
          type="submit"
          disabled={isSaving || !title.trim()}
          className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary-default px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </form>
    </DialogShell>
  );
}

function WorkspaceRailButton({
  active,
  collapsed,
  icon,
  label,
  trailing,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active
          ? 'bg-background-selected text-text-default'
          : 'text-text-subtle hover:bg-background-selected hover:text-text-default'
      } ${FOCUS_RING_CLASS} ${collapsed ? 'justify-center' : ''}`}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {trailing ? <span className="shrink-0 text-text-subtle">{trailing}</span> : null}
        </>
      ) : null}
    </button>
  );
}

function TeamLogo({ team }: { team: TeamSummary }) {
  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt=""
        className="h-5 w-5 rounded-[5px] object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-background-selected text-[10px] font-semibold uppercase text-text-subtle">
      {team.name.trim().slice(0, 1) || 'T'}
    </span>
  );
}

function TopBarIconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`app-topbar-button ${COMPACT_ICON_BUTTON_CLASS}`}
    >
      {children}
    </button>
  );
}

function AppTopBar({
  railCollapsed,
  onToggleRail,
}: {
  railCollapsed: boolean;
  onToggleRail: () => void;
}) {
  return (
    <header className="app-topbar flex h-[52px] shrink-0 items-center border-b border-border-default bg-background-default pl-[86px] pr-3">
      <div className="flex items-center gap-1">
        <TopBarIconButton
          label={railCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          onClick={onToggleRail}
        >
          {railCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </TopBarIconButton>
      </div>
    </header>
  );
}

function WorkspaceRail({
  scope,
  user,
  teams,
  collapsed,
  onScopeChange,
  onOpenSettings,
}: {
  scope: WorkspaceScope;
  user?: { name: string; username: string };
  teams: TeamSummary[];
  collapsed: boolean;
  onScopeChange: (scope: WorkspaceScope) => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className={`flex shrink-0 flex-col border-r border-border-default bg-background-default pt-5 transition-[width] ${
      collapsed ? 'w-16' : 'w-64'
    }`}
    >
      <div className={`px-3 pb-4 ${collapsed ? 'text-center' : ''}`}>
        <div className="flex items-center gap-2">
          {!collapsed ? (
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">HackDesk</h1>
              <p className="truncate text-xs text-text-subtle">
                {user ? `${user.name} @${user.username}` : 'Workspace'}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-1 px-2">
        <WorkspaceRailButton
          active={scope.type === 'personal'}
          collapsed={collapsed}
          icon={<Folder className="h-4 w-4" />}
          label="My Workspace"
          onClick={() => onScopeChange({ type: 'personal', label: 'My Workspace' })}
        />
        <WorkspaceRailButton
          active={scope.type === 'history'}
          collapsed={collapsed}
          icon={<History className="h-4 w-4" />}
          label="History"
          onClick={() => onScopeChange({ type: 'history', label: 'History' })}
        />
      </div>

      {!collapsed ? (
        <div className="mt-4 px-4 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          Teams
        </div>
      ) : null}
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-4">
        {teams.map((team) => (
          <WorkspaceRailButton
            key={team.id}
            active={scope.type === 'team' && scope.teamPath === team.path}
            collapsed={collapsed}
            icon={<TeamLogo team={team} />}
            label={team.name}
            trailing={team.visibility === 'private' ? <Lock className="h-3.5 w-3.5" /> : null}
            onClick={() => onScopeChange({ type: 'team', label: team.name, teamPath: team.path })}
          />
        ))}
      </div>

      <div className="border-t border-border-default p-2">
        <WorkspaceRailButton
          active={false}
          collapsed={collapsed}
          icon={<Settings2 className="h-4 w-4" />}
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </aside>
  );
}

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

function FolderNavigator({
  scope,
  tree,
  entries,
  selectedFolderId,
  selectedNoteId,
  search,
  isLoading,
  hasToken,
  collapsed,
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
  onToggleCollapsed: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}) {
  const isSearching = search.trim().length > 0;

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
    <section className="flex w-[400px] shrink-0 flex-col border-r border-border-default bg-background-muted">
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

        <div className="flex h-10 items-center gap-2 rounded-md border border-border-default bg-background-default px-3 transition-colors focus-within:border-primary-default">
          <Search className="h-4 w-4 text-text-subtle" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search notes"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>

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
        ) : entries.length === 0 ? (
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
          </div>
        )}
      </div>
    </section>
  );
}

function DocumentDetail({
  document,
  isLoading,
  onOpenEditor,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  document?: DocumentSummary;
  isLoading: boolean;
  onOpenEditor: (document: DocumentSummary) => void;
  onSave: (document: DocumentSummary, input: { title: string; content: string }) => void;
  onDelete: (document: DocumentSummary) => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    setTitle(document?.title ?? '');
    setContent(document?.content ?? '');
  }, [document?.id, document?.title, document?.content]);

  if (isLoading) {
    return (
      <section className="flex h-full flex-1 items-center justify-center text-text-subtle">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading note
      </section>
    );
  }

  if (!document) {
    return (
      <section className="flex h-full flex-1 items-center justify-center text-sm text-text-subtle">
        Select a note.
      </section>
    );
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background-default">
      <header className="flex items-center gap-3 border-b border-border-default px-5 py-3">
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full truncate bg-transparent text-lg font-semibold outline-none"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-subtle">
            <span>{formatDate(document.updatedAtMillis)}</span>
            <span>{document.readPermission} read</span>
            <span>{document.writePermission} write</span>
            {document.teamPath ? <span>@{document.teamPath}</span> : null}
            {document.folderPaths.length > 0 ? <span>{getFolderPathLabel(document.folderPaths)}</span> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenEditor(document)}
          className={SECONDARY_BUTTON_CLASS}
        >
          <Edit3 className="h-4 w-4" />
          Web Editor
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onSave(document, { title, content })}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => onDelete(document)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive-default text-destructive-default transition-colors active:bg-destructive-soft ${PRESSED_CLASS} ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
          aria-label="Delete note"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </header>

      <MarkdownEditor value={content} onChange={setContent} />
    </section>
  );
}

function CommandPalette({
  state,
  onStateChange,
  onNewNote,
  onOpenSettings,
}: {
  state: CommandPaletteState;
  onStateChange: (state: CommandPaletteState) => void;
  onNewNote: () => void;
  onOpenSettings: () => void;
}) {
  if (!state.open) {
    return null;
  }

  const commands = [
    { id: 'new-note', label: 'New Note', icon: <Plus className="h-4 w-4" />, action: onNewNote },
    { id: 'settings', label: 'Open Settings', icon: <Settings2 className="h-4 w-4" />, action: onOpenSettings },
  ].filter((command) => command.label.toLowerCase().includes(state.search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background-overlay pt-24">
      <div className="w-[560px] overflow-hidden rounded-lg border border-border-default bg-background-default shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border-default px-3 transition-colors focus-within:border-primary-default">
          <Search className="h-4 w-4 text-text-subtle" />
          <input
            autoFocus
            value={state.search}
            onChange={(event) => onStateChange({ ...state, search: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onStateChange({ open: false, search: '' });
              }
            }}
            className="h-12 flex-1 bg-transparent text-sm outline-none"
            placeholder="Search commands"
          />
        </div>
        <div className="p-2">
          {commands.map((command) => (
            <button
              key={command.id}
              type="button"
              onClick={() => {
                command.action();
                onStateChange({ open: false, search: '' });
              }}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm transition-colors hover:bg-background-selected ${FOCUS_RING_CLASS}`}
            >
              {command.icon}
              {command.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const api = getHackDeskAPI();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<WorkspaceScope>({ type: 'personal', label: 'My Workspace' });
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteSummary | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [palette, setPalette] = useState<CommandPaletteState>({ open: false, search: '' });
  const [createDialog, setCreateDialog] = useState<CreateNoteDialogState>({ open: false, title: '' });
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(() => readBooleanStorage(RAIL_COLLAPSED_KEY, false));
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(() => readBooleanStorage(NAVIGATOR_COLLAPSED_KEY, false));
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}personal`));

  const settingsQuery = useQuery({
    queryKey: ['electron', 'settings'],
    queryFn: () => api?.settings.get(),
    enabled: !!api,
  });
  const settings = settingsQuery.data;
  const hasToken = isTokenConfigured(settings);

  const userQuery = useQuery({
    queryKey: ['electron', 'hackmd', 'current-user'],
    queryFn: () => api?.hackmd.getCurrentUser(),
    enabled: !!api && hasToken,
  });

  const teamsQuery = useQuery({
    queryKey: ['electron', 'hackmd', 'teams'],
    queryFn: () => api?.hackmd.listTeams(),
    enabled: !!api && hasToken,
  });

  const notesQuery = useQuery({
    queryKey: getWorkspaceQueryKey(scope),
    queryFn: () => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'team') {
        return api.hackmd.listTeamNotes(scope.teamPath);
      }

      return scope.type === 'history'
        ? api.hackmd.listHistory(40)
        : api.hackmd.listNotes();
    },
    enabled: !!api && hasToken,
  });

  const currentNotes = unwrapRepositoryValue(notesQuery.data) ?? EMPTY_NOTES;
  const teams = unwrapRepositoryValue(teamsQuery.data) ?? EMPTY_TEAMS;
  const user = unwrapRepositoryValue(userQuery.data);
  const folderTree = useMemo(() => buildHackmdFolderTree(currentNotes), [currentNotes]);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const visibleEntries = useMemo(() => {
    const entries = normalizedSearch
      ? folderTree.allNotes.filter((entry) => noteMatchesSearch(entry, normalizedSearch))
      : getFolderNoteEntries(folderTree, selectedFolderId);

    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = normalizedSearch ? `${entry.folderLabel}:${entry.note.id}` : entry.note.id;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [folderTree, normalizedSearch, selectedFolderId]);
  const selectedFolder = selectedFolderId === UNFILED_FOLDER_ID
    ? folderTree.unfiled
    : selectedFolderId ? folderTree.nodesById.get(selectedFolderId) ?? null : null;
  const selectedFolderLabel = selectedFolder ? getFolderPathLabel(selectedFolder.folderPath) : null;
  const selectedParentFolderId = selectedFolderId && selectedFolderId !== UNFILED_FOLDER_ID ? selectedFolderId : undefined;
  const canCreate = hasToken && scope.type !== 'history';

  useEffect(() => {
    const storageKey = `${FOLDER_COLLAPSED_PREFIX}${getScopeStorageKey(scope)}`;
    setCollapsedFolderIds(readStringArrayStorage(storageKey));
    setSelectedFolderId(null);
    setSelectedNote(null);
    setSearch('');
  }, [scope]);

  useEffect(() => {
    writeStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${getScopeStorageKey(scope)}`, collapsedFolderIds);
  }, [collapsedFolderIds, scope]);

  useEffect(() => {
    if (!selectedNote || !visibleEntries.some((entry) => entry.note.id === selectedNote.id)) {
      setSelectedNote(visibleEntries[0]?.note ?? null);
    }
  }, [selectedNote, visibleEntries]);

  const documentQuery = useQuery({
    queryKey: ['electron', 'hackmd', 'note', selectedNote?.teamPath ?? null, selectedNote?.id],
    queryFn: () => {
      if (!api || !selectedNote) {
        throw new Error('No note selected.');
      }

      return api.hackmd.getNote(selectedNote.id, selectedNote.teamPath);
    },
    enabled: !!api && !!selectedNote,
  });

  const document = unwrapRepositoryValue(documentQuery.data);

  const invalidateCurrentNotes = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
    if (selectedNote) {
      void queryClient.invalidateQueries({
        queryKey: ['electron', 'hackmd', 'note', selectedNote.teamPath ?? null, selectedNote.id],
      });
    }
  }, [queryClient, scope, selectedNote]);

  const updateSettingsMutation = useMutation({
    mutationFn: (input: { title: string; hackmdApiToken?: string }) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      return api.settings.update(input);
    },
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(['electron', 'settings'], nextSettings);
      void queryClient.invalidateQueries({ queryKey: ['electron', 'hackmd'] });
      toast.success('Settings saved.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save settings.'),
  });

  const createNoteMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      const input = {
        title,
        content: createQuickNoteContent(title),
        ...(selectedParentFolderId ? { parentFolderId: selectedParentFolderId } : {}),
      };
      return scope.type === 'team'
        ? api.hackmd.createTeamNote(scope.teamPath, input)
        : api.hackmd.createNote(input);
    },
    onSuccess: (createdNote) => {
      setCreateDialog({ open: false, title: '' });
      invalidateCurrentNotes();
      setSelectedNote(createdNote);
      toast.success('Note created.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create note.'),
  });
  const handleCreateNote = useCallback(() => {
    if (!hasToken) {
      setSettingsOpen(true);
      return;
    }

    if (scope.type === 'history') {
      toast.info('Choose My Workspace or a team before creating a note.');
      return;
    }

    setCreateDialog({ open: true, title: '' });
  }, [hasToken, scope.type]);

  const updateNoteMutation = useMutation({
    mutationFn: ({ note, input }: { note: DocumentSummary; input: { title: string; content: string } }) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      const payload = {
        title: input.title.trim() || 'Untitled',
        content: input.content,
      };

      return note.teamPath
        ? api.hackmd.updateTeamNote(note.teamPath, note.id, payload)
        : api.hackmd.updateNote(note.id, payload);
    },
    onSuccess: (updatedNote) => {
      setSelectedNote(updatedNote);
      invalidateCurrentNotes();
      toast.success('Note saved.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save note.'),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (note: DocumentSummary) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (note.teamPath) {
        await api.hackmd.deleteTeamNote(note.teamPath, note.id);
      } else {
        await api.hackmd.deleteNote(note.id);
      }
    },
    onSuccess: () => {
      setDeleteTarget(null);
      setSelectedNote(null);
      invalidateCurrentNotes();
      toast.success('Note deleted.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete note.'),
  });

  const handleDeleteRequest = useCallback((note: DocumentSummary) => {
    if (!api?.app.confirm) {
      setDeleteTarget(note);
      return;
    }

    api.app.confirm({
      title: 'Delete Note',
      message: `Delete “${note.title || 'Untitled'}”?`,
      detail: 'This removes the note from HackMD. This action cannot be undone from HackDesk.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    }).then(({ confirmed }) => {
      if (confirmed) {
        deleteNoteMutation.mutate(note);
      }
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm note deletion.');
    });
  }, [api, deleteNoteMutation]);

  const handleOpenEditor = useCallback((note: DocumentSummary) => {
    api?.shell.openHackmdEditor(note).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to open HackMD editor.');
    });
  }, [api]);

  const openPalette = useCallback(() => {
    setPalette({ open: true, search: '' });
  }, []);

  useEffect(() => {
    return api?.app.onCommand((command) => {
      switch (command.type) {
      case 'open-command-palette':
        openPalette();
        break;
      case 'open-settings':
        setSettingsOpen(true);
        break;
      case 'new-note':
        handleCreateNote();
        break;
      }
    });
  }, [api, handleCreateNote, openPalette]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (palette.open) {
        setPalette({ open: false, search: '' });
        return;
      }

      if (createDialog.open) {
        setCreateDialog({ open: false, title: '' });
        return;
      }

      if (deleteTarget) {
        setDeleteTarget(null);
        return;
      }

      if (settingsOpen) {
        setSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createDialog.open, deleteTarget, palette.open, settingsOpen]);

  if (!api) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-muted text-sm text-text-subtle">
        Electron API is unavailable.
      </div>
    );
  }

  const notesError = getRepositoryError(notesQuery.data);
  const userError = getRepositoryError(userQuery.data);
  const teamsError = getRepositoryError(teamsQuery.data);
  const activeError = notesError ?? userError ?? teamsError;
  const showingCachedFallback =
    isShowingCachedFallback(notesQuery.data)
    || isShowingCachedFallback(userQuery.data)
    || isShowingCachedFallback(teamsQuery.data);
  const emptyTitle = !hasToken
    ? 'Connect HackMD first'
    : normalizedSearch
      ? 'No matching notes'
      : selectedFolder
        ? 'No notes in this folder'
        : 'No notes in this workspace';
  const emptyDescription = !hasToken
    ? 'Add an API token in Settings to load your profile, teams, notes, and history.'
    : normalizedSearch
      ? 'Try a different title, tag, folder path, short ID, or team path.'
      : scope.type === 'history'
        ? 'Your HackMD history will appear here after the first successful sync.'
        : 'Select another folder, create a note here, or refresh after another client changes HackMD.';

  const toggleRailCollapsed = () => {
    setRailCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(RAIL_COLLAPSED_KEY, next);
      return next;
    });
  };
  const toggleNavigatorCollapsed = () => {
    setNavigatorCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(NAVIGATOR_COLLAPSED_KEY, next);
      return next;
    });
  };
  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };
  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);

    if (folderId && folderId !== UNFILED_FOLDER_ID) {
      setCollapsedFolderIds((current) => {
        if (!current.has(folderId)) {
          return current;
        }

        const next = new Set(current);
        next.delete(folderId);
        return next;
      });
    }
  };

  return (
    <div className="app-chrome flex h-screen flex-col overflow-hidden bg-background-muted text-text-default">
      <AppTopBar
        railCollapsed={railCollapsed}
        onToggleRail={toggleRailCollapsed}
      />

      <main className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceRail
          scope={scope}
          user={user}
          teams={teams}
          collapsed={railCollapsed}
          onScopeChange={setScope}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <FolderNavigator
          scope={scope}
          tree={folderTree}
          entries={visibleEntries}
          selectedFolderId={selectedFolderId}
          selectedNoteId={selectedNote?.id ?? null}
          search={search}
          isLoading={notesQuery.isLoading}
          hasToken={hasToken}
          collapsed={navigatorCollapsed}
          collapsedFolderIds={collapsedFolderIds}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          activeError={activeError}
          showingCachedFallback={showingCachedFallback}
          canCreate={canCreate}
          isFetching={notesQuery.isFetching}
          isCreating={createNoteMutation.isPending}
          onFolderSelect={handleFolderSelect}
          onFolderToggle={toggleFolderCollapsed}
          onNoteSelect={setSelectedNote}
          onSearchChange={setSearch}
          onRefresh={() => notesQuery.refetch()}
          onCreate={handleCreateNote}
          onToggleCollapsed={toggleNavigatorCollapsed}
          onOpenPalette={openPalette}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <DocumentDetail
          document={document}
          isLoading={documentQuery.isLoading || documentQuery.isFetching}
          onOpenEditor={handleOpenEditor}
          onSave={(note, input) => updateNoteMutation.mutate({ note, input })}
          onDelete={handleDeleteRequest}
          isSaving={updateNoteMutation.isPending}
          isDeleting={deleteNoteMutation.isPending}
        />
      </main>

      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          isSaving={updateSettingsMutation.isPending}
          onSave={(input) => updateSettingsMutation.mutate(input)}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      <CommandPalette
        state={palette}
        onStateChange={setPalette}
        onNewNote={handleCreateNote}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <CreateNoteDialog
        state={createDialog}
        scopeLabel={scope.label}
        folderLabel={selectedFolderLabel}
        isCreating={createNoteMutation.isPending}
        onStateChange={setCreateDialog}
        onCancel={() => setCreateDialog({ open: false, title: '' })}
        onCreate={(title) => createNoteMutation.mutate(title)}
      />

      <DeleteNoteDialog
        note={deleteTarget}
        isDeleting={deleteNoteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onDelete={(note) => deleteNoteMutation.mutate(note)}
      />
    </div>
  );
}
