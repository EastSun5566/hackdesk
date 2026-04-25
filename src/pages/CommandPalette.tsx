import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import Fuse from 'fuse.js';
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Clock3,
  CreditCard,
  FileText,
  Loader2,
  Moon,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  ShoppingCart,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useTheme } from '@/components/theme-provider';
import { Cmd } from '@/constants';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useCommandPaletteWindow } from '@/hooks/useCommandPaletteWindow';
import {
  getHackmdErrorMessage,
  getHackmdNotePath,
  getHackmdProfilePath,
  normalizeHackmdToken,
  useCreateHackmdNote,
  useDeleteHackmdNote,
  useHackmdNotes,
  useHackmdProfile,
  useHackmdTeams,
  type HackmdNote,
  type HackmdTeam,
} from '@/lib/hackmd';
import { useSettings } from '@/lib/query';
import { defaultSettings } from '@/lib/settings';
import { openAgentWindow } from '@/lib/agent';
import {
  findCommand,
  getAllCommands,
  getRecentCommands,
  getRecentNotes,
  getSettingsNavigationCommands,
  groupCommands,
  type RecentNoteEntry,
  removeRecentNote,
  saveRecentNote,
  saveRecentCommand,
} from './CommandPalette.config';

type PaletteMode = 'root' | 'notes' | 'notes-team-workspaces' | 'note-actions' | 'confirm-delete' | 'team-navigation' | 'team-routes' | 'route-search' | 'settings-navigation';

type RouteSearchContext = {
  basePath: string;
  scopeLabel: string;
  placeholder: string;
  backMode: 'root' | 'team-routes';
};

type TeamNavigationCommand = {
  id: string;
  value: string;
  label: string;
  description: string;
  team: HackmdTeam;
  Icon: React.ReactNode;
  keywords: string[];
};

const NOTE_VALUE_PREFIX = 'hackmd-note:';
const RECENT_NOTE_VALUE_PREFIX = 'hackmd-recent-note:';
const CREATE_NOTE_VALUE_PREFIX = 'hackmd-create:';
const OPEN_NOTES_TEAM_WORKSPACES_VALUE = 'hackmd-open-notes-team-workspaces';
const TEAM_NAVIGATION_VALUE = 'hackmd:team-navigation';
const SETTINGS_NAVIGATION_VALUE = 'hackmd:settings';
const TEAM_NAVIGATION_TEAM_VALUE_PREFIX = 'hackmd-team-navigation-team:';
const BACK_TO_ROOT_VALUE = 'hackmd-back-to-root';
const BACK_TO_NOTES_TEAM_WORKSPACES_VALUE = 'hackmd-back-to-notes-team-workspaces';
const BACK_TO_TEAM_NAVIGATION_VALUE = 'hackmd-back-to-team-navigation';
const PERSONAL_SCOPE_VALUE = 'hackmd-scope-personal';
const TEAM_SCOPE_VALUE_PREFIX = 'hackmd-scope-team:';
const BACK_TO_NOTES_VALUE = 'hackmd-back-to-notes';
const OPEN_NOTE_VALUE = 'hackmd-open-note';
const DELETE_NOTE_VALUE = 'hackmd-delete-note';
const CONFIRM_DELETE_NOTE_VALUE = 'hackmd-confirm-delete-note';
const CANCEL_DELETE_NOTE_VALUE = 'hackmd-cancel-delete-note';
const EXECUTE_ROUTE_SEARCH_VALUE = 'hackmd-execute-route-search';
const BACK_FROM_ROUTE_SEARCH_VALUE = 'hackmd-back-from-route-search';
const RETRY_NOTES_VALUE = 'hackmd-retry-notes';
const RETRY_TEAMS_VALUE = 'hackmd-retry-teams';
const OPEN_LOCAL_SETTINGS_VALUE = 'hackdesk:settings';
const EMPTY_NOTES: HackmdNote[] = [];
const EMPTY_TEAMS: HackmdTeam[] = [];

async function redirect(path: string) {
  await invoke(Cmd.EXECUTE_ACTION, {
    action: {
      type: 'Navigate',
      data: { path },
    },
  });
}

function buildRouteSearchPath(basePath: string, query: string) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return basePath;
  }

  const [pathWithoutHash, hashFragment] = basePath.split('#', 2);
  const separator = pathWithoutHash.includes('?') ? '&' : '?';

  return `${pathWithoutHash}${separator}q=${encodeURIComponent(normalizedQuery)}${hashFragment ? `#${hashFragment}` : ''}`;
}

function formatNoteDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function NoteCommandItem({
  note,
  onSelect,
  valuePrefix = NOTE_VALUE_PREFIX,
}: {
  note: HackmdNote;
  onSelect: (value: string) => void;
  valuePrefix?: string;
}) {
  const tags = note.tags.slice(0, 2).join(', ');
  const metadata = [note.teamPath ? `Team · ${note.teamPath}` : null, tags || note.shortId]
    .filter(Boolean)
    .join(' · ');

  return (
    <CommandItem
      value={`${valuePrefix}${note.id}`}
      onSelect={onSelect}
      className="items-start gap-3 py-3"
    >
      <FileText className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-semibold">{note.title || 'Untitled note'}</span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-300/80">
          {metadata}
        </span>
      </div>
      <CommandShortcut>{formatNoteDate(note.lastChangedAt)}</CommandShortcut>
    </CommandItem>
  );
}

function TeamWorkspaceCommandItem({
  team,
  onSelect,
  valuePrefix = TEAM_NAVIGATION_TEAM_VALUE_PREFIX,
  current = false,
}: {
  team: HackmdTeam;
  onSelect: (value: string) => void;
  valuePrefix?: string;
  current?: boolean;
}) {
  return (
    <CommandItem
      value={`${valuePrefix}${team.path}`}
      onSelect={onSelect}
      className="items-start gap-3 py-3"
    >
      <Users className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-semibold">{team.name}</span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-300/80">
          {team.description?.trim() || `Open ${team.name} routes`}
        </span>
      </div>
      <CommandShortcut>{current ? 'Current' : `@${team.path}`}</CommandShortcut>
    </CommandItem>
  );
}

function getTeamRouteCommands(team: HackmdTeam): TeamNavigationCommand[] {
  const teamBasePath = `/team/${team.path}`;

  return [
    {
      id: `${team.path}:overview`,
      value: teamBasePath,
      label: 'Overview',
      description: `${team.name} workspace overview`,
      team,
      Icon: <Users className="mt-0.5 h-4 w-4 shrink-0" />,
      keywords: ['overview', 'workspace', 'team', team.name, team.path],
    },
    {
      id: `${team.path}:search`,
      value: `${teamBasePath}?nav=search`,
      label: 'Search',
      description: `Search notes in ${team.name}`,
      team,
      Icon: <Search className="mt-0.5 h-4 w-4 shrink-0" />,
      keywords: ['search', 'find', 'notes', team.name, team.path],
    },
    {
      id: `${team.path}:recent`,
      value: `${teamBasePath}/recent`,
      label: 'Recent',
      description: `Open recent notes in ${team.name}`,
      team,
      Icon: <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />,
      keywords: ['recent', 'history', 'activity', team.name, team.path],
    },
    {
      id: `${team.path}:bookmark`,
      value: `${teamBasePath}/bookmark`,
      label: 'Bookmarks',
      description: `Open bookmarks in ${team.name}`,
      team,
      Icon: <Bookmark className="mt-0.5 h-4 w-4 shrink-0" />,
      keywords: ['bookmark', 'favorites', 'saved', team.name, team.path],
    },
    {
      id: `${team.path}:trash`,
      value: `${teamBasePath}?nav=trash`,
      label: 'Trash',
      description: `Open trash in ${team.name}`,
      team,
      Icon: <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />,
      keywords: ['trash', 'deleted', 'bin', team.name, team.path],
    },
    {
      id: `${team.path}:manage`,
      value: `${teamBasePath}/manage`,
      label: 'Manage Workspace',
      description: `Open team settings for ${team.name}`,
      team,
      Icon: <Settings2 className="mt-0.5 h-4 w-4 shrink-0" />,
      keywords: ['manage', 'settings', 'workspace', team.name, team.path],
    },
    {
      id: `${team.path}:billing`,
      value: `${teamBasePath}?nav=billing`,
      label: 'Billing',
      description: `Open billing for ${team.name}`,
      team,
      Icon: <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />,
      keywords: ['billing', 'payment', 'subscription', team.name, team.path],
    },
    {
      id: `${team.path}:purchase`,
      value: `${teamBasePath}?nav=purchase`,
      label: 'Purchase',
      description: `Open purchase options for ${team.name}`,
      team,
      Icon: <ShoppingCart className="mt-0.5 h-4 w-4 shrink-0" />,
      keywords: ['purchase', 'upgrade', 'checkout', team.name, team.path],
    },
  ];
}

function TeamNavigationCommandItem({
  command,
  onSelect,
}: {
  command: TeamNavigationCommand;
  onSelect: (value: string) => void;
}) {
  return (
    <CommandItem
      value={command.value}
      onSelect={onSelect}
      className="items-start gap-3 py-3"
    >
      {command.Icon}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-semibold">{command.label}</span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-300/80">
          {command.description}
        </span>
      </div>
      <CommandShortcut>{command.team.name}</CommandShortcut>
    </CommandItem>
  );
}

export function CommandPalette() {
  const [mode, setMode] = useState<PaletteMode>('root');
  const [search, setSearch] = useState('');
  const { theme, setTheme } = useTheme();
  const { data: settingsData } = useSettings();
  const [recentValues, setRecentValues] = useState<string[]>([]);
  const [recentNoteEntries, setRecentNoteEntries] = useState<RecentNoteEntry[]>([]);
  const [selectedNote, setSelectedNote] = useState<HackmdNote | null>(null);
  const [selectedTeamPath, setSelectedTeamPath] = useState<string | null>(null);
  const [selectedNavigationTeamPath, setSelectedNavigationTeamPath] = useState<string | null>(null);
  const [routeSearchContext, setRouteSearchContext] = useState<RouteSearchContext | null>(null);

  const settings = settingsData ?? defaultSettings;
  const hackmdToken = normalizeHackmdToken(settings.hackmdApiToken);
  const hasHackmdToken = hackmdToken.length > 0;
  const profileQuery = useHackmdProfile(hackmdToken, hasHackmdToken);
  const profilePath = getHackmdProfilePath(profileQuery.data?.userPath);
  const availableCommands = useMemo(
    () => getAllCommands({ hasHackmdToken, profilePath }),
    [hasHackmdToken, profilePath],
  );
  const settingsNavigationCommands = useMemo(() => getSettingsNavigationCommands(), []);
  const isNotesMode = mode === 'notes';
  const isNotesTeamWorkspacesMode = mode === 'notes-team-workspaces';
  const isNoteDetailMode = mode === 'note-actions' || mode === 'confirm-delete';
  const isTeamNavigationMode = mode === 'team-navigation';
  const isTeamRoutesMode = mode === 'team-routes';
  const isRouteSearchMode = mode === 'route-search';
  const isSettingsNavigationMode = mode === 'settings-navigation';
  const isExpandedMode = isNotesMode || isNotesTeamWorkspacesMode || isNoteDetailMode || isTeamNavigationMode || isTeamRoutesMode || isSettingsNavigationMode;
  const shouldLoadTeams = hasHackmdToken && (isNotesTeamWorkspacesMode || isTeamNavigationMode || isTeamRoutesMode || selectedTeamPath !== null);
  const shouldLoadNotes = hasHackmdToken && isNotesMode;

  useCommandPaletteWindow(isExpandedMode ? 'notes' : 'compact');

  const teamsQuery = useHackmdTeams(shouldLoadTeams);
  const notesQuery = useHackmdNotes(hackmdToken, shouldLoadNotes, selectedTeamPath);
  const createNoteMutation = useCreateHackmdNote(hackmdToken, selectedTeamPath);
  const deleteNoteMutation = useDeleteHackmdNote(hackmdToken, selectedTeamPath);
  const teams = teamsQuery.data ?? EMPTY_TEAMS;
  const selectedTeam = useMemo(
    () => teams.find((team) => team.path === selectedTeamPath) ?? null,
    [selectedTeamPath, teams],
  );
  const selectedNavigationTeam = useMemo(
    () => teams.find((team) => team.path === selectedNavigationTeamPath) ?? null,
    [selectedNavigationTeamPath, teams],
  );
  const selectedTeamLabel = selectedTeam?.name ?? selectedTeamPath ?? null;

  useEffect(() => {
    setRecentValues(getRecentCommands());
    setRecentNoteEntries(getRecentNotes());
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(availableCommands, {
        keys: ['label', 'keywords', 'value'],
        threshold: 0.3,
        includeScore: true,
      }),
    [availableCommands],
  );

  const searchResults = useMemo(() => {
    if (!search || mode !== 'root') return availableCommands;
    return fuse.search(search).map((result) => result.item);
  }, [availableCommands, fuse, mode, search]);

  const groupedCommands = useMemo(
    () => groupCommands(mode === 'root' ? search : '', searchResults, recentValues, availableCommands),
    [availableCommands, mode, recentValues, search, searchResults],
  );

  const notes = notesQuery.data ?? EMPTY_NOTES;
  const notesById = useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes],
  );
  const notesFuse = useMemo(
    () =>
      new Fuse(notes, {
        keys: ['title', 'tags', 'permalink', 'shortId'],
        threshold: 0.35,
      }),
    [notes],
  );
  const filteredNotes = useMemo(() => {
    if (mode !== 'notes') {
      return notes;
    }

    if (!search.trim()) {
      return notes;
    }

    return notesFuse.search(search).map((result) => result.item);
  }, [mode, notes, notesFuse, search]);
  const recentNotes = useMemo(() => {
    if (mode !== 'notes' || search.trim()) {
      return [];
    }

    const activeTeamPath = selectedTeamPath?.trim() || null;

    return recentNoteEntries
      .map((entry) => {
        if (entry.legacy) {
          return notesById.get(entry.noteId);
        }

        return entry.teamPath === activeTeamPath
          ? notesById.get(entry.noteId)
          : undefined;
      })
      .filter((note): note is HackmdNote => note !== undefined);
  }, [mode, notesById, recentNoteEntries, search, selectedTeamPath]);
  const recentNoteIdsSet = useMemo(() => new Set(recentNotes.map((note) => note.id)), [recentNotes]);
  const noteResults = useMemo(
    () => filteredNotes.filter((note) => !recentNoteIdsSet.has(note.id)),
    [filteredNotes, recentNoteIdsSet],
  );
  const trimmedSearch = search.trim();
  const teamNavigationTeamFuse = useMemo(
    () =>
      new Fuse(teams, {
        keys: ['name', 'path', 'description'],
        threshold: 0.3,
      }),
    [teams],
  );
  const filteredTeamNavigationTeams = useMemo(() => {
    if (!isTeamNavigationMode) {
      return teams;
    }

    if (!trimmedSearch) {
      return teams;
    }

    return teamNavigationTeamFuse.search(trimmedSearch).map((result) => result.item);
  }, [isTeamNavigationMode, teamNavigationTeamFuse, teams, trimmedSearch]);
  const filteredNotesTeamWorkspaces = useMemo(() => {
    if (!isNotesTeamWorkspacesMode) {
      return teams;
    }

    if (!trimmedSearch) {
      return teams;
    }

    return teamNavigationTeamFuse.search(trimmedSearch).map((result) => result.item);
  }, [isNotesTeamWorkspacesMode, teamNavigationTeamFuse, teams, trimmedSearch]);
  const selectedNavigationTeamCommands = useMemo(
    () => selectedNavigationTeam ? getTeamRouteCommands(selectedNavigationTeam) : [],
    [selectedNavigationTeam],
  );
  const teamRouteFuse = useMemo(
    () =>
      new Fuse(selectedNavigationTeamCommands, {
        keys: ['label', 'description', 'keywords', 'value'],
        threshold: 0.3,
      }),
    [selectedNavigationTeamCommands],
  );
  const filteredSelectedNavigationTeamCommands = useMemo(() => {
    if (!isTeamRoutesMode) {
      return selectedNavigationTeamCommands;
    }

    if (!trimmedSearch) {
      return selectedNavigationTeamCommands;
    }

    return teamRouteFuse.search(trimmedSearch).map((result) => result.item);
  }, [isTeamRoutesMode, selectedNavigationTeamCommands, teamRouteFuse, trimmedSearch]);
  const settingsNavigationFuse = useMemo(
    () =>
      new Fuse(settingsNavigationCommands, {
        keys: ['label', 'keywords', 'value'],
        threshold: 0.3,
      }),
    [settingsNavigationCommands],
  );
  const filteredSettingsNavigationCommands = useMemo(() => {
    if (!isSettingsNavigationMode) {
      return settingsNavigationCommands;
    }

    if (!trimmedSearch) {
      return settingsNavigationCommands;
    }

    return settingsNavigationFuse.search(trimmedSearch).map((result) => result.item);
  }, [isSettingsNavigationMode, settingsNavigationCommands, settingsNavigationFuse, trimmedSearch]);
  const canCreateNote = mode === 'notes' && trimmedSearch.length > 0 && !notesQuery.isError;
  const showRecentNotes = !notesQuery.isPending && !notesQuery.isError && recentNotes.length > 0;
  const recentNotesHeading = selectedTeamLabel ? `Recent Notes in ${selectedTeamLabel}` : 'Recent Notes';
  const routeSearchPath = routeSearchContext && trimmedSearch.length > 0
    ? buildRouteSearchPath(routeSearchContext.basePath, trimmedSearch)
    : null;
  const canExecuteRouteSearch = isRouteSearchMode && routeSearchPath !== null;
  const routeSearchActionLabel = routeSearchContext && trimmedSearch.length > 0
    ? `Search for “${trimmedSearch}” in ${routeSearchContext.scopeLabel}`
    : null;
  const hasSettingsNavigationResults = filteredSettingsNavigationCommands.length > 0;
  const showNotesContentSeparator = notesQuery.isPending
    || notesQuery.isError
    || noteResults.length > 0
    || (!notesQuery.isPending && !notesQuery.isError && notes.length === 0);
  const showTeamNavigationContentSeparator = teamsQuery.isPending
    || teamsQuery.isError
    || filteredTeamNavigationTeams.length > 0
    || (!teamsQuery.isPending && !teamsQuery.isError && teams.length === 0)
    || (!teamsQuery.isPending && !teamsQuery.isError && trimmedSearch.length > 0 && teams.length > 0 && filteredTeamNavigationTeams.length === 0);

  const closePalette = useCallback(() => {
    getCurrentWebviewWindow().close();
  }, []);

  const openLocalSettings = useCallback(async () => {
    await invoke('open_settings_window');
    closePalette();
  }, [closePalette]);

  const syncRecentCommands = useCallback(() => {
    setRecentValues(getRecentCommands());
  }, []);

  const syncRecentNotes = useCallback(() => {
    setRecentNoteEntries(getRecentNotes());
  }, []);

  const openRouteSearch = useCallback((context: RouteSearchContext) => {
    setSelectedNote(null);
    setSelectedTeamPath(null);
    setRouteSearchContext(context);
    setSearch('');
    setMode('route-search');
  }, []);

  const handleBack = useCallback(() => {
    setSearch('');

    if (mode === 'confirm-delete') {
      setMode('note-actions');
      return;
    }

    if (mode === 'note-actions') {
      setMode('notes');
      return;
    }

    if (mode === 'notes') {
      setSelectedNote(null);
      setSelectedTeamPath(null);
      setMode('root');
      return;
    }

    if (mode === 'notes-team-workspaces') {
      setSearch('');
      setMode('notes');
      return;
    }

    if (mode === 'team-navigation') {
      setSelectedNote(null);
      setSelectedTeamPath(null);
      setSelectedNavigationTeamPath(null);
      setMode('root');
      return;
    }

    if (mode === 'team-routes') {
      setSearch('');
      setSelectedNavigationTeamPath(null);
      setMode('team-navigation');
      return;
    }

    if (mode === 'route-search') {
      const backMode = routeSearchContext?.backMode ?? 'root';

      setRouteSearchContext(null);
      setMode(backMode);
      return;
    }

    if (mode === 'settings-navigation') {
      setMode('root');
      return;
    }

    closePalette();
  }, [closePalette, mode, routeSearchContext]);

  const handleOpenNote = useCallback(async (note: HackmdNote, editMode = false) => {
    saveRecentNote(note.id, note.teamPath ?? null);
    syncRecentNotes();
    await redirect(getHackmdNotePath(note, editMode));
    closePalette();
  }, [closePalette, syncRecentNotes]);

  const handleCreateNote = useCallback(async (title: string) => {
    try {
      const note = await createNoteMutation.mutateAsync(title);
      saveRecentNote(note.id, note.teamPath ?? null);
      syncRecentNotes();
      toast.success(
        selectedTeamLabel
          ? `Created “${note.title || title.trim()}” in ${selectedTeamLabel}`
          : `Created “${note.title || title.trim()}”`,
      );
      await redirect(getHackmdNotePath(note, true));
      closePalette();
    } catch (error) {
      toast.error(getHackmdErrorMessage(error, 'Failed to create the note.'));
    }
  }, [closePalette, createNoteMutation, selectedTeamLabel, syncRecentNotes]);

  const handleDeleteSelectedNote = useCallback(async () => {
    if (!selectedNote) {
      return;
    }

    try {
      await deleteNoteMutation.mutateAsync(selectedNote.id);
      removeRecentNote(selectedNote.id, selectedNote.teamPath ?? null);
      syncRecentNotes();
      toast.success(`Deleted “${selectedNote.title || 'Untitled note'}”`);
      setSelectedNote(null);
      setSearch('');
      setMode('notes');
    } catch (error) {
      toast.error(getHackmdErrorMessage(error, 'Failed to delete the note.'));
    }
  }, [deleteNoteMutation, selectedNote, syncRecentNotes]);

  const handleSelectPersonalNotes = useCallback(() => {
    setSelectedTeamPath(null);
    setSelectedNote(null);
    setSearch('');
  }, []);

  const handleSelectTeam = useCallback((teamPath: string) => {
    setSelectedTeamPath(teamPath);
    setSelectedNote(null);
    setSearch('');
  }, []);

  const handleRootSelect = (value: string) => {
    const command = findCommand(value, availableCommands);
    if (!command) return;

    saveRecentCommand(value);
    syncRecentCommands();

    switch (value) {
    case 'hackmd:notes':
      setSearch('');
      setSelectedNote(null);
      setSelectedTeamPath(null);
      setSelectedNavigationTeamPath(null);
      setMode('notes');
      return;
    case TEAM_NAVIGATION_VALUE:
      setSearch('');
      setSelectedNote(null);
      setSelectedTeamPath(null);
      setSelectedNavigationTeamPath(null);
      setMode('team-navigation');
      return;
    case SETTINGS_NAVIGATION_VALUE:
      setSearch('');
      setSelectedNote(null);
      setSelectedTeamPath(null);
      setSelectedNavigationTeamPath(null);
      setMode('settings-navigation');
      return;
    case '/?nav=search':
      openRouteSearch({
        basePath: value,
        scopeLabel: 'my notes',
        placeholder: 'Search my notes...',
        backMode: 'root',
      });
      return;
    case 'back':
      invoke(Cmd.EXECUTE_ACTION, { action: { type: 'GoBack' } });
      break;
    case 'forward':
      invoke(Cmd.EXECUTE_ACTION, { action: { type: 'GoForward' } });
      break;
    case 'reload':
      invoke(Cmd.EXECUTE_ACTION, { action: { type: 'Reload' } });
      break;
    case 'hackdesk:agent:ask-current-note':
      void openAgentWindow('ask');
      closePalette();
      return;
    case 'hackdesk:agent:summarize-current-note':
      void openAgentWindow('summary');
      closePalette();
      return;
    case OPEN_LOCAL_SETTINGS_VALUE:
      void openLocalSettings();
      return;
    default:
      void redirect(value);
    }

    closePalette();
  };

  const handleSettingsNavigationSelect = (value: string) => {
    switch (value) {
    case BACK_TO_ROOT_VALUE:
      handleBack();
      return;
    default:
      break;
    }

    const selectedCommand = settingsNavigationCommands.find((command) => command.value === value);
    if (!selectedCommand) {
      return;
    }

    void redirect(selectedCommand.value);
    closePalette();
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
    closePalette();
  };

  const handleNotesSelect = (value: string) => {
    switch (value) {
    case BACK_TO_ROOT_VALUE:
      handleBack();
      return;
    case OPEN_NOTES_TEAM_WORKSPACES_VALUE:
      setSearch('');
      setMode('notes-team-workspaces');
      return;
    case PERSONAL_SCOPE_VALUE:
      handleSelectPersonalNotes();
      return;
    case RETRY_NOTES_VALUE:
      void notesQuery.refetch();
      return;
    case OPEN_LOCAL_SETTINGS_VALUE:
      void openLocalSettings();
      return;
    default:
      break;
    }

    if (value.startsWith(TEAM_SCOPE_VALUE_PREFIX)) {
      handleSelectTeam(value.slice(TEAM_SCOPE_VALUE_PREFIX.length));
      return;
    }

    if (value.startsWith(CREATE_NOTE_VALUE_PREFIX)) {
      void handleCreateNote(value.slice(CREATE_NOTE_VALUE_PREFIX.length));
      return;
    }

    if (value.startsWith(RECENT_NOTE_VALUE_PREFIX)) {
      const noteId = value.slice(RECENT_NOTE_VALUE_PREFIX.length);
      const note = notesById.get(noteId);
      if (!note) {
        return;
      }

      void handleOpenNote(note);
      return;
    }

    if (!value.startsWith(NOTE_VALUE_PREFIX)) {
      return;
    }

    const noteId = value.slice(NOTE_VALUE_PREFIX.length);
    const note = notesById.get(noteId);
    if (!note) {
      return;
    }

    setSelectedNote(note);
    setSearch('');
    setMode('note-actions');
  };

  const handleNotesTeamWorkspacesSelect = (value: string) => {
    switch (value) {
    case BACK_TO_NOTES_TEAM_WORKSPACES_VALUE:
      handleBack();
      return;
    case RETRY_TEAMS_VALUE:
      void teamsQuery.refetch();
      return;
    default:
      break;
    }

    if (!value.startsWith(TEAM_SCOPE_VALUE_PREFIX)) {
      return;
    }

    handleSelectTeam(value.slice(TEAM_SCOPE_VALUE_PREFIX.length));
    setMode('notes');
  };

  const handleNoteActionSelect = (value: string) => {
    if (!selectedNote) {
      return;
    }

    switch (value) {
    case BACK_TO_NOTES_VALUE:
      handleBack();
      break;
    case OPEN_NOTE_VALUE:
      void handleOpenNote(selectedNote);
      break;
    case DELETE_NOTE_VALUE:
      setMode('confirm-delete');
      break;
    default:
      break;
    }
  };

  const handleDeleteConfirmSelect = (value: string) => {
    switch (value) {
    case CONFIRM_DELETE_NOTE_VALUE:
      void handleDeleteSelectedNote();
      break;
    case CANCEL_DELETE_NOTE_VALUE:
      handleBack();
      break;
    default:
      break;
    }
  };

  const handleRouteSearchSelect = (value: string) => {
    switch (value) {
    case BACK_FROM_ROUTE_SEARCH_VALUE:
      handleBack();
      return;
    case EXECUTE_ROUTE_SEARCH_VALUE:
      if (!routeSearchPath) {
        return;
      }

      void redirect(routeSearchPath);
      closePalette();
      return;
    default:
      break;
    }
  };

  const handleTeamNavigationSelect = (value: string) => {
    switch (value) {
    case BACK_TO_ROOT_VALUE:
      handleBack();
      return;
    case RETRY_TEAMS_VALUE:
      void teamsQuery.refetch();
      return;
    default:
      break;
    }

    if (!value.startsWith(TEAM_NAVIGATION_TEAM_VALUE_PREFIX)) {
      return;
    }

    setSelectedNavigationTeamPath(value.slice(TEAM_NAVIGATION_TEAM_VALUE_PREFIX.length));
    setSearch('');
    setMode('team-routes');
  };

  const handleTeamRouteSelect = (value: string) => {
    const selectedTeamRouteCommand = selectedNavigationTeamCommands.find((command) => command.value === value);

    switch (value) {
    case BACK_TO_TEAM_NAVIGATION_VALUE:
      handleBack();
      return;
    case RETRY_TEAMS_VALUE:
      void teamsQuery.refetch();
      return;
    default:
      break;
    }

    if (selectedTeamRouteCommand?.id.endsWith(':search')) {
      openRouteSearch({
        basePath: selectedTeamRouteCommand.value,
        scopeLabel: selectedTeamRouteCommand.team.name,
        placeholder: `Search ${selectedTeamRouteCommand.team.name} notes...`,
        backMode: 'team-routes',
      });
      return;
    }

    if (!value.startsWith('/team/')) {
      return;
    }

    void redirect(value);
    closePalette();
  };

  useEffect(() => {
    if (mode === 'root') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Backspace' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (search.length > 0) {
        return;
      }

      const target = event.target;

      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (!target.disabled && !target.readOnly && target.value.length > 0) {
          return;
        }
      }

      if (target instanceof HTMLElement && target.isContentEditable && (target.textContent?.length ?? 0) > 0) {
        return;
      }

      event.preventDefault();
      handleBack();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleBack, mode, search]);

  useEscapeKey(handleBack);

  const inputPlaceholder = mode === 'root'
    ? 'Search commands...'
    : mode === 'notes'
      ? selectedTeamLabel
        ? `Search ${selectedTeamLabel} notes or type a title to create one...`
        : 'Search your notes or type a title to create one...'
      : mode === 'notes-team-workspaces'
        ? 'Search team workspaces...'
        : mode === 'team-routes'
          ? selectedNavigationTeam
            ? `Search ${selectedNavigationTeam.name} routes...`
            : 'Search team routes...'
          : mode === 'settings-navigation'
            ? 'Search settings sections...'
            : mode === 'route-search'
              ? routeSearchContext?.placeholder ?? 'Search notes...'
              : mode === 'team-navigation'
                ? 'Search teams...'
                : mode === 'note-actions'
                  ? 'Choose an action...'
                  : 'Confirm note deletion...';
  const canSearchCurrentMode = mode === 'root'
    || mode === 'notes'
    || mode === 'notes-team-workspaces'
    || mode === 'team-navigation'
    || mode === 'team-routes'
    || mode === 'route-search'
    || mode === 'settings-navigation';
  const emptyStateText = mode === 'root'
    ? 'No commands found.'
    : mode === 'notes-team-workspaces'
      ? 'No team workspaces found.'
      : mode === 'team-navigation'
        ? 'No teams found.'
        : mode === 'team-routes'
          ? 'No team routes found.'
          : mode === 'settings-navigation'
            ? 'No settings sections found.'
            : mode === 'route-search'
              ? 'Type a search query to continue.'
              : 'No notes found.';
  const commandKey = mode;

  return (
    <div className="p-2">
      <Command key={commandKey} shouldFilter={false} loop className={isExpandedMode ? 'min-h-[520px]' : undefined}>
        <CommandInput
          placeholder={inputPlaceholder}
          value={canSearchCurrentMode ? search : ''}
          onValueChange={canSearchCurrentMode ? setSearch : () => {}}
          readOnly={!canSearchCurrentMode}
          aria-readonly={!canSearchCurrentMode}
          className={!canSearchCurrentMode ? 'caret-transparent' : undefined}
          autoFocus
        />
        <CommandList className={isExpandedMode ? 'max-h-[480px]' : undefined}>
          <CommandEmpty>{emptyStateText}</CommandEmpty>

          {mode === 'root' && (
            <>
              {groupedCommands.recent.length > 0 && (
                <>
                  <CommandGroup heading="Recent">
                    {groupedCommands.recent.map((cmd) => (
                      <CommandItem
                        key={cmd.value}
                        value={cmd.value}
                        onSelect={handleRootSelect}
                      >
                        {cmd.Icon}
                        {cmd.label}
                        {cmd.shortcut && (
                          <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {groupedCommands.navigation.length > 0 && (
                <>
                  <CommandGroup heading="Navigation">
                    {groupedCommands.navigation.map((cmd) => (
                      <CommandItem
                        key={cmd.value}
                        value={cmd.value}
                        onSelect={handleRootSelect}
                      >
                        {cmd.Icon}
                        {cmd.label}
                        {cmd.shortcut && (
                          <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {groupedCommands.action.length > 0 && (
                <>
                  <CommandGroup heading="Actions">
                    {groupedCommands.action.map((cmd) => (
                      <CommandItem
                        key={cmd.value}
                        value={cmd.value}
                        onSelect={handleRootSelect}
                      >
                        {cmd.Icon}
                        {cmd.label}
                        {cmd.shortcut && (
                          <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {groupedCommands.hackmd.length > 0 && (
                <>
                  <CommandGroup heading="HackMD">
                    {groupedCommands.hackmd.map((cmd) => (
                      <CommandItem
                        key={cmd.value}
                        value={cmd.value}
                        onSelect={handleRootSelect}
                      >
                        {cmd.Icon}
                        {cmd.label}
                        {cmd.shortcut && (
                          <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {groupedCommands.settings.length > 0 && (
                <CommandGroup heading="Settings">
                  {groupedCommands.settings.map((cmd) => (
                    <CommandItem
                      key={cmd.value}
                      value={cmd.value}
                      onSelect={handleRootSelect}
                    >
                      {cmd.Icon}
                      {cmd.label}
                      {cmd.shortcut && (
                        <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                  <CommandItem value="toggle-theme" onSelect={handleThemeToggle}>
                    {theme === 'dark' ? (
                      <Sun className="mr-2 h-4 w-4" />
                    ) : (
                      <Moon className="mr-2 h-4 w-4" />
                    )}
                    Toggle Theme
                    <CommandShortcut>⌘ T</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              )}
            </>
          )}

          {mode === 'notes' && (
            <>
              {showRecentNotes && (
                <>
                  <CommandGroup heading={recentNotesHeading}>
                    {recentNotes.map((note) => (
                      <NoteCommandItem
                        key={note.id}
                        note={note}
                        onSelect={handleNotesSelect}
                        valuePrefix={RECENT_NOTE_VALUE_PREFIX}
                      />
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              <CommandGroup heading="Workspaces">
                <CommandItem value={BACK_TO_ROOT_VALUE} onSelect={handleNotesSelect}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Commands
                </CommandItem>
                <CommandItem value={PERSONAL_SCOPE_VALUE} onSelect={handleNotesSelect}>
                  <FileText className="mr-2 h-4 w-4" />
                  My Workspace
                  {!selectedTeamLabel ? <CommandShortcut>Current</CommandShortcut> : null}
                </CommandItem>
                <CommandItem value={OPEN_NOTES_TEAM_WORKSPACES_VALUE} onSelect={handleNotesSelect}>
                  <Users className="mr-2 h-4 w-4" />
                  Team Workspaces…
                  {selectedTeamLabel ? <CommandShortcut>{selectedTeamLabel}</CommandShortcut> : null}
                </CommandItem>
                {canCreateNote && (
                  <CommandItem
                    value={`${CREATE_NOTE_VALUE_PREFIX}${trimmedSearch}`}
                    onSelect={handleNotesSelect}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {selectedTeamLabel ? `Create “${trimmedSearch}” in ${selectedTeamLabel}` : `Create “${trimmedSearch}”`}
                  </CommandItem>
                )}
              </CommandGroup>

              {showNotesContentSeparator && (
                <CommandSeparator />
              )}

              {notesQuery.isPending && (
                <CommandGroup heading="Loading">
                  <CommandItem value="hackmd-loading-notes" disabled>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading your notes...
                  </CommandItem>
                </CommandGroup>
              )}

              {notesQuery.isError && (
                <CommandGroup heading="Connection">
                  <CommandItem value="hackmd-notes-error" disabled className="items-start gap-3 py-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-default" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium text-destructive-default">Unable to load HackMD notes</span>
                      <span className="text-xs text-text-subtle">
                        {getHackmdErrorMessage(notesQuery.error, 'Please check your API token.')}
                      </span>
                    </div>
                  </CommandItem>
                  <CommandItem value={OPEN_LOCAL_SETTINGS_VALUE} onSelect={handleNotesSelect}>
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    Open HackDesk Settings
                  </CommandItem>
                  <CommandItem value={RETRY_NOTES_VALUE} onSelect={handleNotesSelect}>
                    <Loader2 className="mr-2 h-4 w-4" />
                    Retry Notes Sync
                  </CommandItem>
                </CommandGroup>
              )}

              {!notesQuery.isPending && !notesQuery.isError && notes.length === 0 && (
                <CommandGroup heading={selectedTeamLabel ? `${selectedTeamLabel} Notes` : 'Your Notes'}>
                  <CommandItem value="hackmd-no-notes" disabled className="items-start gap-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">
                        {selectedTeamLabel ? `No notes in ${selectedTeamLabel} yet` : 'No notes yet'}
                      </span>
                      <span className="text-xs text-text-subtle">
                        {selectedTeamLabel
                          ? 'Type a title above to create the first note in this team workspace.'
                          : 'Type a title above to create your first HackMD note from the palette.'}
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {!notesQuery.isPending && !notesQuery.isError && noteResults.length > 0 && (
                <CommandGroup heading={trimmedSearch ? 'Search Results' : selectedTeamLabel ? `${selectedTeamLabel} Notes` : 'Your Notes'}>
                  {noteResults.map((note) => (
                    <NoteCommandItem key={note.id} note={note} onSelect={handleNotesSelect} />
                  ))}
                </CommandGroup>
              )}
            </>
          )}

          {mode === 'notes-team-workspaces' && (
            <>
              <CommandGroup heading="Team Workspaces">
                <CommandItem value={BACK_TO_NOTES_TEAM_WORKSPACES_VALUE} onSelect={handleNotesTeamWorkspacesSelect}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Notes
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />

              {teamsQuery.isPending && (
                <CommandGroup heading="Loading">
                  <CommandItem value="hackmd-loading-note-teams" disabled>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading team workspaces...
                  </CommandItem>
                </CommandGroup>
              )}

              {teamsQuery.isError && (
                <CommandGroup heading="Connection">
                  <CommandItem value="hackmd-note-teams-error" disabled className="items-start gap-3 py-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-default" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium text-destructive-default">Unable to load team workspaces</span>
                      <span className="text-xs text-text-subtle">
                        {getHackmdErrorMessage(teamsQuery.error, 'Please try again in a moment.')}
                      </span>
                    </div>
                  </CommandItem>
                  <CommandItem value={RETRY_TEAMS_VALUE} onSelect={handleNotesTeamWorkspacesSelect}>
                    <Loader2 className="mr-2 h-4 w-4" />
                    Retry Team Sync
                  </CommandItem>
                </CommandGroup>
              )}

              {!teamsQuery.isPending && !teamsQuery.isError && teams.length === 0 && (
                <CommandGroup heading="Teams">
                  <CommandItem value="hackmd-no-notes-teams" disabled className="items-start gap-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">No team workspaces available</span>
                      <span className="text-xs text-text-subtle">
                        Join or create a team in HackMD to manage team notes here.
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {!teamsQuery.isPending && !teamsQuery.isError && trimmedSearch.length > 0 && teams.length > 0 && filteredNotesTeamWorkspaces.length === 0 && (
                <CommandGroup heading="Teams">
                  <CommandItem value="hackmd-no-matching-notes-teams" disabled className="items-start gap-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">{`No team workspaces match “${trimmedSearch}”`}</span>
                      <span className="text-xs text-text-subtle">
                        Try another team name or clear the search to browse all workspaces.
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {!teamsQuery.isPending && !teamsQuery.isError && filteredNotesTeamWorkspaces.length > 0 && (
                <CommandGroup heading="Teams">
                  {filteredNotesTeamWorkspaces.map((team) => (
                    <TeamWorkspaceCommandItem
                      key={team.path}
                      team={team}
                      valuePrefix={TEAM_SCOPE_VALUE_PREFIX}
                      current={selectedTeamPath === team.path}
                      onSelect={handleNotesTeamWorkspacesSelect}
                    />
                  ))}
                </CommandGroup>
              )}
            </>
          )}

          {mode === 'team-navigation' && (
            <>
              <CommandGroup heading="Team Navigation">
                <CommandItem value={BACK_TO_ROOT_VALUE} onSelect={handleTeamNavigationSelect}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Commands
                </CommandItem>
              </CommandGroup>

              {showTeamNavigationContentSeparator && (
                <CommandSeparator />
              )}

              {teamsQuery.isPending && (
                <CommandGroup heading="Loading">
                  <CommandItem value="hackmd-loading-team-routes" disabled>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading teams...
                  </CommandItem>
                </CommandGroup>
              )}

              {teamsQuery.isError && (
                <CommandGroup heading="Connection">
                  <CommandItem value="hackmd-team-navigation-error" disabled className="items-start gap-3 py-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-default" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium text-destructive-default">Unable to load teams</span>
                      <span className="text-xs text-text-subtle">
                        {getHackmdErrorMessage(teamsQuery.error, 'Please try again in a moment.')}
                      </span>
                    </div>
                  </CommandItem>
                  <CommandItem value={RETRY_TEAMS_VALUE} onSelect={handleTeamNavigationSelect}>
                    <Loader2 className="mr-2 h-4 w-4" />
                    Retry Team Sync
                  </CommandItem>
                </CommandGroup>
              )}

              {!teamsQuery.isPending && !teamsQuery.isError && teams.length === 0 && (
                <CommandGroup heading="Teams">
                  <CommandItem value="hackmd-no-team-destinations" disabled className="items-start gap-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">No team workspaces available</span>
                      <span className="text-xs text-text-subtle">
                        Join or create a team in HackMD to unlock team navigation here.
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {!teamsQuery.isPending && !teamsQuery.isError && trimmedSearch.length > 0 && teams.length > 0 && filteredTeamNavigationTeams.length === 0 && (
                <CommandGroup heading="Search Results">
                  <CommandItem value="hackmd-no-teams-found" disabled className="items-start gap-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">No teams match “{trimmedSearch}”</span>
                      <span className="text-xs text-text-subtle">
                        Try a team name or workspace path.
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {!teamsQuery.isPending && !teamsQuery.isError && filteredTeamNavigationTeams.length > 0 && (
                <CommandGroup heading="Teams">
                  {filteredTeamNavigationTeams.map((team) => (
                    <TeamWorkspaceCommandItem
                      key={team.path}
                      team={team}
                      onSelect={handleTeamNavigationSelect}
                    />
                  ))}
                </CommandGroup>
              )}
            </>
          )}

          {mode === 'team-routes' && (
            <>
              <CommandGroup heading={selectedNavigationTeam ? selectedNavigationTeam.name : 'Team Routes'}>
                <CommandItem value={BACK_TO_TEAM_NAVIGATION_VALUE} onSelect={handleTeamRouteSelect}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Teams
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />

              {!selectedNavigationTeam && (
                <CommandGroup heading="Selection">
                  <CommandItem value="hackmd-missing-team-selection" disabled className="items-start gap-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">Team not found</span>
                      <span className="text-xs text-text-subtle">
                        Please go back and choose a team workspace again.
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {selectedNavigationTeam && filteredSelectedNavigationTeamCommands.length > 0 && (
                <CommandGroup heading="Routes">
                  {filteredSelectedNavigationTeamCommands.map((command) => (
                    <TeamNavigationCommandItem
                      key={command.id}
                      command={command}
                      onSelect={handleTeamRouteSelect}
                    />
                  ))}
                </CommandGroup>
              )}

              {selectedNavigationTeam && trimmedSearch.length > 0 && filteredSelectedNavigationTeamCommands.length === 0 && (
                <CommandGroup heading="Search Results">
                  <CommandItem value="hackmd-no-team-route-results" disabled className="items-start gap-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">No routes match “{trimmedSearch}” in {selectedNavigationTeam.name}</span>
                      <span className="text-xs text-text-subtle">
                        Try a route name like search, manage, recent, or billing.
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}
            </>
          )}

          {mode === 'route-search' && routeSearchContext && (
            <>
              <CommandGroup heading={routeSearchContext.backMode === 'team-routes' ? `Search ${routeSearchContext.scopeLabel}` : 'Search'}>
                {canExecuteRouteSearch && routeSearchActionLabel ? (
                  <CommandItem value={EXECUTE_ROUTE_SEARCH_VALUE} onSelect={handleRouteSearchSelect}>
                    <Search className="mr-2 h-4 w-4" />
                    {routeSearchActionLabel}
                  </CommandItem>
                ) : (
                  <CommandItem value="hackmd-route-search-hint" disabled className="items-start gap-3 py-3">
                    <Search className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">Type a query to search {routeSearchContext.scopeLabel}</span>
                      <span className="text-xs text-text-subtle">
                        We&apos;ll navigate to the HackMD search route with the `q` parameter filled in for you.
                      </span>
                    </div>
                  </CommandItem>
                )}
                <CommandItem value={BACK_FROM_ROUTE_SEARCH_VALUE} onSelect={handleRouteSearchSelect}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {routeSearchContext.backMode === 'team-routes' ? 'Back to Team Routes' : 'Back to Commands'}
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {mode === 'settings-navigation' && (
            <>
              <CommandGroup heading="My Settings">
                <CommandItem value={BACK_TO_ROOT_VALUE} onSelect={handleSettingsNavigationSelect}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Commands
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              {hasSettingsNavigationResults ? (
                <CommandGroup heading="Sections">
                  {filteredSettingsNavigationCommands.map((command) => (
                    <CommandItem
                      key={command.value}
                      value={command.value}
                      onSelect={handleSettingsNavigationSelect}
                    >
                      {command.Icon}
                      {command.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </>
          )}

          {mode === 'note-actions' && selectedNote && (
            <>
              <CommandGroup heading="Selected Note">
                <CommandItem value="hackmd-selected-note" disabled className="items-start gap-3 py-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">{selectedNote.title || 'Untitled note'}</span>
                    <span className="truncate text-xs text-text-subtle">
                      Last changed {formatNoteDate(selectedNote.lastChangedAt)}
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem value={BACK_TO_NOTES_VALUE} onSelect={handleNoteActionSelect}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Notes
                </CommandItem>
                <CommandItem value={OPEN_NOTE_VALUE} onSelect={handleNoteActionSelect}>
                  <FileText className="mr-2 h-4 w-4" />
                  Open Note
                </CommandItem>
                <CommandItem value={DELETE_NOTE_VALUE} onSelect={handleNoteActionSelect}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Note
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {mode === 'confirm-delete' && selectedNote && (
            <>
              <CommandGroup heading="Delete Note">
                <CommandItem value="hackmd-delete-warning" disabled className="items-start gap-3 py-3">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-default" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium text-destructive-default">
                      Delete “{selectedNote.title || 'Untitled note'}”?
                    </span>
                    <span className="text-xs text-text-subtle">
                      This action cannot be undone from HackDesk.
                    </span>
                  </div>
                </CommandItem>
                <CommandItem value={CONFIRM_DELETE_NOTE_VALUE} onSelect={handleDeleteConfirmSelect}>
                  {deleteNoteMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {deleteNoteMutation.isPending ? 'Deleting...' : 'Yes, Delete Note'}
                </CommandItem>
                <CommandItem value={CANCEL_DELETE_NOTE_VALUE} onSelect={handleDeleteConfirmSelect}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Cancel
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
