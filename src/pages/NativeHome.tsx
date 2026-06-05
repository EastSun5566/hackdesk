import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Edit3,
  FileText,
  Folder,
  History,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Trash2,
  Users,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { getHackDeskAPI } from '@/lib/electron-api';
import type {
  DocumentSummary,
  ElectronSafeSettings,
  NoteSummary,
  RepositoryValue,
  TeamSummary,
} from '@/lib/electron-api';

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

function isTokenConfigured(settings?: ElectronSafeSettings) {
  return settings?.hasHackmdApiToken === true;
}

function WorkspaceButton({
  active,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active
          ? 'bg-background-selected text-text-default'
          : 'text-text-subtle hover:bg-background-selected hover:text-text-default'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="text-xs text-text-subtle">{meta}</span> : null}
    </button>
  );
}

function NotesList({
  notes,
  selectedNoteId,
  onSelect,
  emptyTitle = 'No notes found',
  emptyDescription,
}: {
  notes: NoteSummary[];
  selectedNoteId: string | null;
  onSelect: (note: NoteSummary) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (notes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-64 space-y-2">
          <FileText className="mx-auto h-7 w-7 text-text-subtle" />
          <p className="text-sm font-medium text-text-default">{emptyTitle}</p>
          {emptyDescription ? <p className="text-xs leading-5 text-text-subtle">{emptyDescription}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {notes.map((note) => {
        const selected = note.id === selectedNoteId;
        const metadata = [
          note.teamPath ? `@${note.teamPath}` : null,
          note.tags.slice(0, 2).join(', '),
        ].filter(Boolean).join(' · ');

        return (
          <button
            key={note.id}
            type="button"
            onClick={() => onSelect(note)}
            className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors ${
              selected
                ? 'bg-primary-soft text-text-default'
                : 'hover:bg-background-selected'
            }`}
          >
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{note.title || 'Untitled'}</span>
              <span className="mt-1 block truncate text-xs text-text-subtle">
                {metadata || note.shortId}
              </span>
            </span>
            <span className="shrink-0 text-xs text-text-subtle">{formatDate(note.updatedAtMillis)}</span>
          </button>
        );
      })}
    </div>
  );
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
      <span>
        {cached ? `Showing cached data. ${error}` : error}
      </span>
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
      <div className="w-full max-w-md rounded-lg border border-border-default bg-background-default shadow-2xl">
        <div className="border-b border-border-default px-5 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
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
  isCreating,
  onStateChange,
  onCancel,
  onCreate,
}: {
  state: CreateNoteDialogState;
  scopeLabel: string;
  isCreating: boolean;
  onStateChange: (state: CreateNoteDialogState) => void;
  onCancel: () => void;
  onCreate: (title: string) => void;
}) {
  if (!state.open) {
    return null;
  }

  const normalizedTitle = state.title.trim();

  return (
    <DialogShell
      title="New Note"
      description={`Create a note in ${scopeLabel}.`}
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
            className="h-10 w-full rounded-md border border-border-default bg-background-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary-default"
            placeholder="Sprint notes"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-md border border-border-default px-3 text-sm hover:bg-background-selected"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!normalizedTitle || isCreating}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
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
            className="inline-flex h-9 items-center rounded-md border border-border-default px-3 text-sm hover:bg-background-selected"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => onDelete(note)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive-default px-3 text-sm font-medium text-destructive-default hover:bg-destructive-soft disabled:opacity-50"
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
    <aside className="w-80 border-l border-border-default bg-background-default p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-text-subtle hover:bg-background-selected"
        >
          Close
        </button>
      </div>

      <div className="space-y-5">
        <label className="block space-y-2 text-sm">
          <span className="font-medium">Window Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-10 w-full rounded-md border border-border-default bg-background-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary-default"
          />
        </label>

        <label className="block space-y-2 text-sm">
          <span className="font-medium">HackMD API Token</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder={settings?.hasHackmdApiToken ? 'Token configured' : 'Paste token'}
            className="h-10 w-full rounded-md border border-border-default bg-background-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary-default"
          />
        </label>

        <button
          type="button"
          disabled={isSaving || !title.trim()}
          onClick={() => onSave({
            title: title.trim(),
            ...(token.trim() ? { hackmdApiToken: token.trim() } : {}),
          })}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary-default px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>
    </aside>
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
    <section className="flex h-full flex-1 flex-col bg-background-default">
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
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenEditor(document)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border-default px-3 text-sm hover:bg-background-selected"
        >
          <Edit3 className="h-4 w-4" />
          Web Editor
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onSave(document, { title, content })}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => onDelete(document)}
          className="inline-flex h-9 items-center justify-center rounded-md border border-destructive-default px-3 text-destructive-default hover:bg-destructive-soft disabled:opacity-50"
          aria-label="Delete note"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </header>

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-background-default p-5 font-mono text-sm leading-6 outline-none"
      />
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
        <div className="flex items-center gap-2 border-b border-border-default px-3">
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
              className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-background-selected"
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

export function NativeHome() {
  const api = getHackDeskAPI();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<WorkspaceScope>({ type: 'personal', label: 'My Workspace' });
  const [selectedNote, setSelectedNote] = useState<NoteSummary | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [palette, setPalette] = useState<CommandPaletteState>({ open: false, search: '' });
  const [createDialog, setCreateDialog] = useState<CreateNoteDialogState>({ open: false, title: '' });
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);

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
  const filteredNotes = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return currentNotes;
    }

    return currentNotes.filter((note) => {
      const text = [
        note.title,
        note.description,
        note.shortId,
        note.teamPath,
        note.userPath,
        ...note.tags,
      ].filter(Boolean).join(' ').toLowerCase();

      return text.includes(normalizedSearch);
    });
  }, [currentNotes, deferredSearch]);

  useEffect(() => {
    if (!selectedNote || !filteredNotes.some((note) => note.id === selectedNote.id)) {
      setSelectedNote(filteredNotes[0] ?? null);
    }
  }, [filteredNotes, selectedNote]);

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

      const input = { title, content: createQuickNoteContent(title) };
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
    setCreateDialog({ open: true, title: '' });
  }, []);

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
    : deferredSearch.trim()
      ? 'No matching notes'
      : 'No notes in this workspace';
  const emptyDescription = !hasToken
    ? 'Add an API token in Settings to load your profile, teams, notes, and history.'
    : deferredSearch.trim()
      ? 'Try a different title, tag, short ID, or team path.'
      : scope.type === 'history'
        ? 'Your HackMD history will appear here after the first successful sync.'
        : 'Create a note from this workspace or refresh after another client changes HackMD.';

  return (
    <div className="flex h-screen overflow-hidden bg-background-muted text-text-default">
      <aside className="flex w-64 flex-col border-r border-border-default bg-background-default pt-8">
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">HackDesk</h1>
              <p className="truncate text-xs text-text-subtle">
                {user ? `${user.name} @${user.username}` : 'Native workspace'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-md p-2 text-text-subtle hover:bg-background-selected hover:text-text-default"
              aria-label="Open settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-1 px-2">
          <WorkspaceButton
            active={scope.type === 'personal'}
            icon={<Folder className="h-4 w-4" />}
            label="My Workspace"
            onClick={() => setScope({ type: 'personal', label: 'My Workspace' })}
          />
          <WorkspaceButton
            active={scope.type === 'history'}
            icon={<History className="h-4 w-4" />}
            label="History"
            onClick={() => setScope({ type: 'history', label: 'History' })}
          />
        </div>

        <div className="mt-4 px-4 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          Teams
        </div>
        <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-4">
          {teams.map((team) => (
            <WorkspaceButton
              key={team.id}
              active={scope.type === 'team' && scope.teamPath === team.path}
              icon={<Users className="h-4 w-4" />}
              label={team.name}
              meta={team.visibility}
              onClick={() => setScope({ type: 'team', label: team.name, teamPath: team.path })}
            />
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1">
        <section className="flex w-[380px] flex-col border-r border-border-default bg-background-muted">
          <header className="space-y-3 border-b border-border-default px-4 pb-4 pt-8">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{scope.label}</h2>
                <p className="text-xs text-text-subtle">{filteredNotes.length} notes</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => notesQuery.refetch()}
                  className="rounded-md p-2 text-text-subtle hover:bg-background-selected hover:text-text-default"
                  aria-label="Refresh notes"
                >
                  <RefreshCcw className={`h-4 w-4 ${notesQuery.isFetching ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleCreateNote}
                  disabled={!hasToken || createNoteMutation.isPending}
                  className="rounded-md p-2 text-text-subtle hover:bg-background-selected hover:text-text-default disabled:opacity-50"
                  aria-label="Create note"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={openPalette}
                  className="rounded-md p-2 text-text-subtle hover:bg-background-selected hover:text-text-default"
                  aria-label="Open command palette"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex h-10 items-center gap-2 rounded-md border border-border-default bg-background-default px-3">
              <Search className="h-4 w-4 text-text-subtle" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notes"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>

            {!hasToken ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex w-full items-center gap-2 rounded-md border border-border-default bg-background-default px-3 py-2 text-left text-sm text-text-subtle hover:bg-background-selected"
              >
                <AlertCircle className="h-4 w-4" />
                Configure HackMD API token
              </button>
            ) : null}

            <RepositoryNotice error={activeError} cached={showingCachedFallback} />
          </header>

          <div className="min-h-0 flex-1 overflow-auto">
            {notesQuery.isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-text-subtle">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading notes
              </div>
            ) : (
              <NotesList
                notes={filteredNotes}
                selectedNoteId={selectedNote?.id ?? null}
                onSelect={setSelectedNote}
                emptyTitle={emptyTitle}
                emptyDescription={emptyDescription}
              />
            )}
          </div>
        </section>

        <DocumentDetail
          document={document}
          isLoading={documentQuery.isLoading || documentQuery.isFetching}
          onOpenEditor={handleOpenEditor}
          onSave={(note, input) => updateNoteMutation.mutate({ note, input })}
          onDelete={setDeleteTarget}
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
