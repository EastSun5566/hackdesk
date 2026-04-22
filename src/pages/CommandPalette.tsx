import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import Fuse from 'fuse.js';
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  Loader2,
  Moon,
  Plus,
  ShieldAlert,
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
  normalizeHackmdToken,
  useCreateHackmdNote,
  useDeleteHackmdNote,
  useHackmdNotes,
  useHackmdTeams,
  type HackmdNote,
  type HackmdTeam,
} from '@/lib/hackmd';
import { useSettings } from '@/lib/query';
import { defaultSettings } from '@/lib/settings';
import {
  findCommand,
  getAllCommands,
  getRecentCommands,
  getRecentNotes,
  groupCommands,
  type RecentNoteEntry,
  removeRecentNote,
  saveRecentNote,
  saveRecentCommand,
} from './CommandPalette.config';

type PaletteMode = 'root' | 'notes' | 'note-actions' | 'confirm-delete';

const NOTE_VALUE_PREFIX = 'hackmd-note:';
const RECENT_NOTE_VALUE_PREFIX = 'hackmd-recent-note:';
const CREATE_NOTE_VALUE_PREFIX = 'hackmd-create:';
const BACK_TO_ROOT_VALUE = 'hackmd-back-to-root';
const PERSONAL_SCOPE_VALUE = 'hackmd-scope-personal';
const TEAM_SCOPE_VALUE_PREFIX = 'hackmd-scope-team:';
const BACK_TO_NOTES_VALUE = 'hackmd-back-to-notes';
const OPEN_NOTE_VALUE = 'hackmd-open-note';
const DELETE_NOTE_VALUE = 'hackmd-delete-note';
const CONFIRM_DELETE_NOTE_VALUE = 'hackmd-confirm-delete-note';
const CANCEL_DELETE_NOTE_VALUE = 'hackmd-cancel-delete-note';
const RETRY_NOTES_VALUE = 'hackmd-retry-notes';
const RETRY_TEAMS_VALUE = 'hackmd-retry-teams';
const OPEN_LOCAL_SETTINGS_VALUE = 'hackmd-open-local-settings';
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
        <span className="truncate font-medium">{note.title || 'Untitled note'}</span>
        <span className="truncate text-xs text-muted-foreground">
          {metadata}
        </span>
      </div>
      <CommandShortcut>{formatNoteDate(note.lastChangedAt)}</CommandShortcut>
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

  const settings = settingsData ?? defaultSettings;
  const hackmdToken = normalizeHackmdToken(settings.hackmdApiToken);
  const hasHackmdToken = hackmdToken.length > 0;
  const availableCommands = useMemo(
    () => getAllCommands({ hasHackmdToken }),
    [hasHackmdToken],
  );
  const isNotesMode = mode !== 'root';

  useCommandPaletteWindow(isNotesMode ? 'notes' : 'compact');

  const teamsQuery = useHackmdTeams(isNotesMode && hasHackmdToken);
  const notesQuery = useHackmdNotes(hackmdToken, isNotesMode && hasHackmdToken, selectedTeamPath);
  const createNoteMutation = useCreateHackmdNote(hackmdToken, selectedTeamPath);
  const deleteNoteMutation = useDeleteHackmdNote(hackmdToken, selectedTeamPath);
  const teams = teamsQuery.data ?? EMPTY_TEAMS;
  const selectedTeam = useMemo(
    () => teams.find((team) => team.path === selectedTeamPath) ?? null,
    [selectedTeamPath, teams],
  );

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
  const canCreateNote = mode === 'notes' && trimmedSearch.length > 0 && !notesQuery.isError;
  const showRecentNotes = !notesQuery.isPending && !notesQuery.isError && recentNotes.length > 0;
  const recentNotesHeading = selectedTeam ? `Recent Notes in ${selectedTeam.name}` : 'Recent Notes';
  const showNotesContentSeparator = notesQuery.isPending
    || notesQuery.isError
    || noteResults.length > 0
    || (!notesQuery.isPending && !notesQuery.isError && notes.length === 0);

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

    closePalette();
  }, [closePalette, mode]);

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
        selectedTeam
          ? `Created “${note.title || title.trim()}” in ${selectedTeam.name}`
          : `Created “${note.title || title.trim()}”`,
      );
      await redirect(getHackmdNotePath(note, true));
      closePalette();
    } catch (error) {
      toast.error(getHackmdErrorMessage(error, 'Failed to create the note.'));
    }
  }, [closePalette, createNoteMutation, selectedTeam, syncRecentNotes]);

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
      setMode('notes');
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
    case '/settings':
      void openLocalSettings();
      return;
    default:
      void redirect(value);
    }

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
    case PERSONAL_SCOPE_VALUE:
      handleSelectPersonalNotes();
      return;
    case RETRY_NOTES_VALUE:
      void notesQuery.refetch();
      return;
    case RETRY_TEAMS_VALUE:
      void teamsQuery.refetch();
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

  useEscapeKey(handleBack);

  const inputPlaceholder = mode === 'root'
    ? 'Search commands...'
    : mode === 'notes'
      ? selectedTeam
        ? `Search ${selectedTeam.name} notes or type a title to create one...`
        : 'Search your notes or type a title to create one...'
      : mode === 'note-actions'
        ? 'Choose an action...'
        : 'Confirm note deletion...';
  const canSearchCurrentMode = mode === 'root' || mode === 'notes';

  return (
    <div className="p-2">
      <Command shouldFilter={false} loop className={isNotesMode ? 'min-h-[520px]' : undefined}>
        <CommandInput
          placeholder={inputPlaceholder}
          value={canSearchCurrentMode ? search : ''}
          onValueChange={canSearchCurrentMode ? setSearch : () => {}}
          disabled={!canSearchCurrentMode}
          autoFocus
        />
        <CommandList className={isNotesMode ? 'max-h-[480px]' : undefined}>
          <CommandEmpty>{mode === 'root' ? 'No commands found.' : 'No notes found.'}</CommandEmpty>

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
                  Personal Notes
                  {!selectedTeam ? <CommandShortcut>Current</CommandShortcut> : null}
                </CommandItem>
                {canCreateNote && (
                  <CommandItem
                    value={`${CREATE_NOTE_VALUE_PREFIX}${trimmedSearch}`}
                    onSelect={handleNotesSelect}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {selectedTeam ? `Create “${trimmedSearch}” in ${selectedTeam.name}` : `Create “${trimmedSearch}”`}
                  </CommandItem>
                )}
                {teamsQuery.isPending ? (
                  <CommandItem value="hackmd-loading-teams" disabled>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading team workspaces...
                  </CommandItem>
                ) : null}
                {teams.map((team) => (
                  <CommandItem
                    key={team.path}
                    value={`${TEAM_SCOPE_VALUE_PREFIX}${team.path}`}
                    onSelect={handleNotesSelect}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    {team.name}
                    {selectedTeamPath === team.path ? <CommandShortcut>Current</CommandShortcut> : null}
                  </CommandItem>
                ))}
                {!teamsQuery.isPending && !teamsQuery.isError && teams.length === 0 ? (
                  <CommandItem value="hackmd-no-teams" disabled>
                    <Users className="mr-2 h-4 w-4" />
                    No team workspaces available
                  </CommandItem>
                ) : null}
                {teamsQuery.isError ? (
                  <>
                    <CommandItem value="hackmd-teams-error" disabled className="items-start gap-3 py-3">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium text-destructive">Unable to load team workspaces</span>
                        <span className="text-xs text-muted-foreground">
                          {getHackmdErrorMessage(teamsQuery.error, 'Please try again in a moment.')}
                        </span>
                      </div>
                    </CommandItem>
                    <CommandItem value={RETRY_TEAMS_VALUE} onSelect={handleNotesSelect}>
                      <Loader2 className="mr-2 h-4 w-4" />
                      Retry Team Sync
                    </CommandItem>
                  </>
                ) : null}
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
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium text-destructive">Unable to load HackMD notes</span>
                      <span className="text-xs text-muted-foreground">
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
                <CommandGroup heading={selectedTeam ? `${selectedTeam.name} Notes` : 'Your Notes'}>
                  <CommandItem value="hackmd-no-notes" disabled className="items-start gap-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">
                        {selectedTeam ? `No notes in ${selectedTeam.name} yet` : 'No notes yet'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {selectedTeam
                          ? 'Type a title above to create the first note in this team workspace.'
                          : 'Type a title above to create your first HackMD note from the palette.'}
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}

              {!notesQuery.isPending && !notesQuery.isError && noteResults.length > 0 && (
                <CommandGroup heading={trimmedSearch ? 'Search Results' : selectedTeam ? `${selectedTeam.name} Notes` : 'Your Notes'}>
                  {noteResults.map((note) => (
                    <NoteCommandItem key={note.id} note={note} onSelect={handleNotesSelect} />
                  ))}
                </CommandGroup>
              )}
            </>
          )}

          {mode === 'note-actions' && selectedNote && (
            <>
              <CommandGroup heading="Selected Note">
                <CommandItem value="hackmd-selected-note" disabled className="items-start gap-3 py-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">{selectedNote.title || 'Untitled note'}</span>
                    <span className="truncate text-xs text-muted-foreground">
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
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium text-destructive">
                      Delete “{selectedNote.title || 'Untitled note'}”?
                    </span>
                    <span className="text-xs text-muted-foreground">
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
