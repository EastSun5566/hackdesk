import {
  FileText,
  FileArchive,
  Download,
  Folder,
  FolderTree,
  FolderPlus,
  FolderPen,
  History,
  Users,
  Trash2,
  Keyboard,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  BookOpen,
  ArrowLeftRight,
  Columns2,
  PanelLeftOpen,
  PanelRightOpen,
  StepBack,
  StepForward,
  Upload,
  X,
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
import {
  getActionDisabledReason,
  getActionLabel,
  getCommandPaletteActions,
  type ElectronActionContext,
} from '@/lib/electron-actions';
import type { ElectronActionId, TeamSummary } from '@/lib/electron-api';
import {
  getQuickOpenActionResults,
  getQuickOpenFolderResults,
  getQuickOpenNoteResults,
  getQuickOpenRecentNoteResults,
  getQuickOpenWorkspaceResults,
  shouldShowFinderQuickAction,
  type QuickOpenFolderResult,
  type QuickOpenWorkspaceResult,
} from '@/lib/electron-quick-open';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import type { FolderTree as HackmdFolderTree, FolderTreeNote } from '@/lib/hackmd-folders';

import type { CommandPaletteState, WorkspaceScope } from './types';

const ACTION_ICONS: Record<ElectronActionId, ReactNode> = {
  'new-note': <FileText className="h-4 w-4" />,
  'new-folder': <FolderPlus className="h-4 w-4" />,
  'rename-folder': <FolderPen className="h-4 w-4" />,
  'delete-folder': <Trash2 className="h-4 w-4" />,
  'save-note': <Save className="h-4 w-4" />,
  'export-note-markdown': <Download className="h-4 w-4" />,
  'import-markdown-note': <Upload className="h-4 w-4" />,
  'open-note-web-editor': <FileText className="h-4 w-4" />,
  'delete-note': <Trash2 className="h-4 w-4" />,
  'close-tab': <X className="h-4 w-4" />,
  'close-other-tabs': <X className="h-4 w-4" />,
  'split-pane-right': <Columns2 className="h-4 w-4" />,
  'move-tab-to-other-pane': <ArrowLeftRight className="h-4 w-4" />,
  'focus-next-tab': <StepForward className="h-4 w-4" />,
  'focus-previous-tab': <StepBack className="h-4 w-4" />,
  'focus-next-pane': <PanelRightOpen className="h-4 w-4" />,
  'focus-previous-pane': <PanelLeftOpen className="h-4 w-4" />,
  'open-settings': <Settings2 className="h-4 w-4" />,
  'toggle-theme': <Moon className="h-4 w-4" />,
  'open-command-palette': <Keyboard className="h-4 w-4" />,
  'toggle-workspace-rail': <PanelLeftClose className="h-4 w-4" />,
  'toggle-navigator': <PanelLeft className="h-4 w-4" />,
  'toggle-inspector': <PanelRightClose className="h-4 w-4" />,
  'toggle-reader-mode': <BookOpen className="h-4 w-4" />,
  refresh: <RefreshCcw className="h-4 w-4" />,
  'go-history': <History className="h-4 w-4" />,
  'export-debug-logs': <FileArchive className="h-4 w-4" />,
  'focus-workspace': <PanelLeft className="h-4 w-4" />,
  'focus-navigator': <FolderTree className="h-4 w-4" />,
  'focus-editor': <PanelRight className="h-4 w-4" />,
  'focus-inspector': <PanelRightClose className="h-4 w-4" />,
};

export function CommandPaletteDialog({
  state,
  context,
  folderTree,
  recentNotes,
  teams,
  scope,
  selectedNoteId,
  selectedFolderId,
  onStateChange,
  onRunAction,
  onSelectNote,
  onSelectRecentNote,
  onSelectFolder,
  onSelectWorkspace,
  onShowFinderResults,
}: {
  state: CommandPaletteState;
  context: ElectronActionContext;
  folderTree: HackmdFolderTree;
  recentNotes: ElectronRecentNote[];
  teams: TeamSummary[];
  scope: WorkspaceScope;
  selectedNoteId: string | null;
  selectedFolderId: string | null;
  onStateChange: (state: CommandPaletteState) => void;
  onRunAction: (actionId: ElectronActionId) => void;
  onSelectNote: (entry: FolderTreeNote) => void;
  onSelectRecentNote: (entry: ElectronRecentNote) => void;
  onSelectFolder: (folder: QuickOpenFolderResult) => void;
  onSelectWorkspace: (workspace: QuickOpenWorkspaceResult) => void;
  onShowFinderResults: (query: string) => void;
}) {
  const trimmedSearch = state.search.trim();
  const recentResults = getQuickOpenRecentNoteResults(recentNotes, state.search);
  const workspaceResults = getQuickOpenWorkspaceResults(teams, state.search);
  const noteResults = getQuickOpenNoteResults(folderTree, state.search, undefined, recentNotes);
  const folderResults = context.scopeType === 'history' ? [] : getQuickOpenFolderResults(folderTree, state.search);
  const actionResults = getQuickOpenActionResults(getCommandPaletteActions(), state.search);
  const showFinderAction = shouldShowFinderQuickAction(state.search);

  const closePalette = () => onStateChange({ open: false, search: '' });

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
            placeholder="Search notes, folders, and commands"
          />
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>
            {recentResults.length > 0 ? (
              <CommandGroup heading="Recent Notes">
                {recentResults.map((entry) => {
                  const metadata = [
                    entry.teamPath ? `Team: ${entry.teamPath}` : 'My Workspace',
                    entry.shortId,
                  ].filter(Boolean).join(' · ');

                  return (
                    <CommandItem
                      key={`recent:${entry.teamPath ?? 'personal'}:${entry.noteId}`}
                      value={`recent note ${entry.title} ${metadata}`}
                      onSelect={() => {
                        onSelectRecentNote(entry);
                        closePalette();
                      }}
                    >
                      <span className="mr-3 text-text-subtle"><History className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{entry.title || 'Untitled'}</span>
                        <span className="block truncate text-xs text-text-subtle">{metadata}</span>
                      </span>
                      {selectedNoteId === entry.noteId ? <CommandShortcut>Recent</CommandShortcut> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {workspaceResults.length > 0 ? (
              <CommandGroup heading="Workspaces">
                {workspaceResults.map((workspace) => {
                  const selected = workspace.type === scope.type
                    && (workspace.type !== 'team' || (scope.type === 'team' && scope.teamPath === workspace.teamPath));

                  return (
                    <CommandItem
                      key={`workspace:${workspace.id}`}
                      value={`workspace ${workspace.label} ${workspace.description}`}
                      onSelect={() => {
                        onSelectWorkspace(workspace);
                        closePalette();
                      }}
                    >
                      <span className="mr-3 text-text-subtle">
                        {workspace.type === 'history'
                          ? <History className="h-4 w-4" />
                          : workspace.type === 'team'
                            ? <Users className="h-4 w-4" />
                            : <Folder className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{workspace.label}</span>
                        <span className="block truncate text-xs text-text-subtle">{workspace.description}</span>
                      </span>
                      {selected ? <CommandShortcut>Current</CommandShortcut> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {noteResults.length > 0 ? (
              <CommandGroup heading="Notes">
                {noteResults.map((entry) => {
                  const workspaceLabel = context.scopeType === 'history'
                    ? 'History'
                    : scope.type === 'team'
                      ? scope.label
                      : 'My Workspace';
                  const metadata = [
                    workspaceLabel,
                    context.scopeType === 'history' ? null : entry.folderLabel || 'Root',
                    entry.note.tags.slice(0, 2).join(', '),
                    entry.note.shortId,
                  ].filter(Boolean).join(' · ');

                  return (
                    <CommandItem
                      key={`note:${entry.note.id}:${entry.folderLabel}`}
                      value={`note ${entry.note.title} ${metadata}`}
                      onSelect={() => {
                        onSelectNote(entry);
                        closePalette();
                      }}
                    >
                      <span className="mr-3 text-text-subtle"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{entry.note.title || 'Untitled'}</span>
                        <span className="block truncate text-xs text-text-subtle">{metadata}</span>
                      </span>
                      {selectedNoteId === entry.note.id ? <CommandShortcut>Selected</CommandShortcut> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {folderResults.length > 0 ? (
              <CommandGroup heading="Folders">
                {folderResults.map((folder) => (
                  <CommandItem
                    key={`folder:${folder.id}`}
                    value={`folder ${folder.label}`}
                    onSelect={() => {
                      onSelectFolder(folder);
                      closePalette();
                    }}
                  >
                    <span className="mr-3 text-text-subtle"><Folder className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{folder.name}</span>
                      <span className="block truncate text-xs text-text-subtle">
                        {folder.label}{folder.noteCount > 0 ? ` · ${folder.noteCount} ${folder.noteCount === 1 ? 'note' : 'notes'}` : ''}
                      </span>
                    </span>
                    {selectedFolderId === folder.id ? <CommandShortcut>Selected</CommandShortcut> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {showFinderAction ? (
              <CommandGroup heading="Finder">
                <CommandItem
                  value={`show finder results ${trimmedSearch}`}
                  onSelect={() => {
                    onShowFinderResults(trimmedSearch);
                    closePalette();
                  }}
                >
                  <span className="mr-3 text-text-subtle"><Search className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{`Show Finder Results for “${trimmedSearch}”`}</span>
                    <span className="block truncate text-xs text-text-subtle">Filter the current workspace in the navigator.</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}

            {actionResults.length > 0 ? (
              <CommandGroup heading="Actions">
                {actionResults.map((action) => {
                  const disabledReason = getActionDisabledReason(action, context);
                  const actionLabel = getActionLabel(action, context);

                  return (
                    <CommandItem
                      key={action.id}
                      value={`${action.label} ${actionLabel} ${action.keywords.join(' ')}`}
                      disabled={Boolean(disabledReason)}
                      onSelect={() => {
                        if (disabledReason) {
                          return;
                        }

                        onRunAction(action.id);
                        closePalette();
                      }}
                    >
                      <span className="mr-3 text-text-subtle">{ACTION_ICONS[action.id]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{actionLabel}</span>
                        <span className="block truncate text-xs text-text-subtle">
                          {disabledReason ?? action.description}
                        </span>
                      </span>
                      {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
