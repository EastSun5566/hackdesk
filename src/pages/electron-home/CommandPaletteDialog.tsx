import { useContext, useMemo, useRef } from 'react';
import { ActionShortcutContext } from './ActionShortcutContext';
import {
  BookOpen,
  Copy,
  FolderInput,
  LayoutTemplate,
  FileText,
  FileArchive,
  Download,
  Folder,
  FolderOpen,
  FolderSearch,
  FolderTree,
  FolderPlus,
  FolderPen,
  History,
  ImagePlus,
  Laptop,
  Link,
  LogIn,
  LogOut,
  Palette,
  Share2,
  Trash2,
  PanelLeftDashed,
  ArrowBigLeftDash,
  ArrowBigRightDash,
  PencilLine,
  DatabaseZap,
  BookX,
  Keyboard,
  MessagesSquare,
  Mic,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Sun,
  Settings2,
  ArrowLeftRight,
  ArrowLeft,
  ArrowRight,
  Check,
  Columns2,
  PanelLeftOpen,
  PanelRightOpen,
  Presentation,
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getActionDisabledReason,
  getActionLabel,
  getResolvedActionShortcut,
  getCommandPaletteActions,
  type ElectronActionContext,
} from '@/lib/electron-actions';
import type { ElectronActionId, TeamSummary, UserSummary } from '@/lib/electron-api';
import {
  getQuickOpenActionResults,
  createQuickOpenFolderSearch,
  createQuickOpenNoteSearch,
  getQuickOpenRecentNoteResults,
  getQuickOpenWorkspaceResults,
  shouldShowFinderQuickAction,
  type QuickOpenFolderResult,
  type QuickOpenWorkspaceResult,
} from '@/lib/electron-quick-open';
import type { ElectronRecentNote } from '@/lib/electron-recent-notes';
import { fuzzySearch } from '@/lib/fuzzy-search';
import type { FolderTree as HackmdFolderTree, FolderTreeNote } from '@/lib/hackmd-folders';
import type { ShortcutOverrides } from '@/lib/keyboard-shortcuts';
import type { ThemeMode, ThemePreset, ThemePresetId } from '@/lib/themes';

import type { CommandPaletteState, WorkspaceScope } from './types';
import { FOCUS_RING_CLASS } from './ui';
import { HighlightedText } from './HighlightedText';
import { SETTINGS_TABS, type SettingsTab } from './SettingsDialogConfig';
import { PersonalWorkspaceIcon, TeamWorkspaceIcon } from './WorkspaceIcon';

const COMMAND_ITEM_ICON_CLASS = 'mr-3 text-command-item-meta';
const COMMAND_ITEM_TITLE_CLASS = 'block truncate font-medium text-command-item-title';
const COMMAND_ITEM_META_CLASS = 'block truncate text-xs text-command-item-meta';
const MOVE_NOTE_FOLDER_LIMIT = 200;

const THEME_MODE_COMMANDS: Array<{
  mode: ThemeMode;
  label: string;
  description: string;
  keywords: string[];
  icon: ReactNode;
}> = [
  {
    mode: 'light',
    label: 'Use Light Theme',
    description: 'Use the light HackDesk appearance.',
    keywords: ['theme', 'appearance', 'palette', 'light'],
    icon: <Sun className="h-4 w-4" />,
  },
  {
    mode: 'dark',
    label: 'Use Dark Theme',
    description: 'Use the dark HackDesk appearance.',
    keywords: ['theme', 'appearance', 'palette', 'dark'],
    icon: <Moon className="h-4 w-4" />,
  },
  {
    mode: 'system',
    label: 'Follow System Appearance',
    description: 'Follow the operating system light or dark appearance.',
    keywords: ['theme', 'appearance', 'palette', 'system', 'auto'],
    icon: <Laptop className="h-4 w-4" />,
  },
];

function searchCommands<T extends { label: string; description: string; keywords?: string[] }>(commands: T[], query: string) {
  return fuzzySearch(commands, query, {
    primary: (command) => command.label,
    secondary: (command) => [command.description, ...(command.keywords ?? [])],
  });
}

function getThemeModeCommands(query: string, activeMode: ThemeMode) {
  return searchCommands(THEME_MODE_COMMANDS, query)
    .map((command) => ({
      ...command,
      active: command.mode === activeMode,
    }));
}

function getThemePresetCommands(query: string, presets: ThemePreset[], activePresetId: ThemePresetId) {
  const commands = presets.map((preset) => ({
    id: preset.id,
    label: `Use Theme: ${preset.name}`,
    description: preset.description,
    keywords: ['theme', 'appearance', 'palette', preset.id],
    active: preset.id === activePresetId,
  }));

  return searchCommands(commands, query);
}

function getAccountCommands(query: string, hasHackmdApiToken: boolean) {
  const connectCommand = {
    id: 'connect-hackmd' as const,
    label: 'Connect HackMD',
    description: 'Add an API token to load your notes and teams.',
    keywords: ['connect', 'token', 'hackmd', 'api', 'login', 'account'],
    icon: <LogIn className="h-4 w-4" />,
  };
  const disconnectCommand = {
    id: 'disconnect-hackmd' as const,
    label: 'Disconnect HackMD',
    description: 'Remove the HackMD API token stored by HackDesk.',
    keywords: ['disconnect', 'logout', 'token', 'hackmd', 'api', 'account'],
    icon: <LogOut className="h-4 w-4" />,
  };
  const command = hasHackmdApiToken ? disconnectCommand : connectCommand;

  return searchCommands([command], query);
}

function getSettingsCommands(query: string) {
  return searchCommands(SETTINGS_TABS.map((tab) => ({
    ...tab,
    label: `Open Settings: ${tab.label}`,
    description: `Open the ${tab.label} page of Settings.`,
    keywords: ['settings', 'preferences', 'options', tab.id],
  })), query);
}

const ACTION_ICONS: Record<ElectronActionId, ReactNode> = {
  'show-keyboard-shortcuts': <Keyboard className="h-4 w-4" />,
  'focus-next-region': <StepForward className="h-4 w-4" />,
  'focus-previous-region': <StepBack className="h-4 w-4" />,
  'scroll-half-page-up': <StepBack className="h-4 w-4" />,
  'scroll-half-page-down': <StepForward className="h-4 w-4" />,
  'new-tab': <FileText className="h-4 w-4" />,
  'new-note': <FileText className="h-4 w-4" />,
  'new-folder': <FolderPlus className="h-4 w-4" />,
  'rename-folder': <FolderPen className="h-4 w-4" />,
  'delete-folder': <Trash2 className="h-4 w-4" />,
  'save-note': <Save className="h-4 w-4" />,
  'find-in-note': <Search className="h-4 w-4" />,
  'attach-image': <ImagePlus className="h-4 w-4" />,
  'ai-assist': <Sparkles className="h-4 w-4" />,
  'ask-notes': <MessagesSquare className="h-4 w-4" />,
  'dictate': <Mic className="h-4 w-4" />,
  'export-note-markdown': <Download className="h-4 w-4" />,
  'import-markdown-note': <Upload className="h-4 w-4" />,
  'open-note-web-editor': <FileText className="h-4 w-4" />,
  'show-note-versions': <History className="h-4 w-4" />,
  'open-as-book': <BookOpen className="h-4 w-4" />,
  'present-note': <Presentation className="h-4 w-4" />,
  'new-note-from-template': <LayoutTemplate className="h-4 w-4" />,
  'save-as-template': <LayoutTemplate className="h-4 w-4" />,
  'previous-chapter': <StepBack className="h-4 w-4" />,
  'next-chapter': <StepForward className="h-4 w-4" />,
  'delete-note': <Trash2 className="h-4 w-4" />,
  'close-tab': <X className="h-4 w-4" />,
  'close-other-tabs': <X className="h-4 w-4" />,
  'close-tabs-to-right': <X className="h-4 w-4" />,
  'reopen-last-closed-tab': <RefreshCcw className="h-4 w-4" />,
  'split-pane-right': <Columns2 className="h-4 w-4" />,
  'move-tab-to-other-pane': <ArrowLeftRight className="h-4 w-4" />,
  'focus-next-tab': <StepForward className="h-4 w-4" />,
  'focus-previous-tab': <StepBack className="h-4 w-4" />,
  'focus-next-pane': <PanelRightOpen className="h-4 w-4" />,
  'focus-previous-pane': <PanelLeftOpen className="h-4 w-4" />,
  'open-settings': <Settings2 className="h-4 w-4" />,
  'toggle-theme': <Moon className="h-4 w-4" />,
  'set-editor-mode-standard': <Keyboard className="h-4 w-4" />,
  'set-editor-mode-vim': <Keyboard className="h-4 w-4" />,
  'set-editor-mode-helix': <Keyboard className="h-4 w-4" />,
  'set-editor-mode-emacs': <Keyboard className="h-4 w-4" />,
  'set-editor-mode-kakoune': <Keyboard className="h-4 w-4" />,
  'open-command-palette': <Keyboard className="h-4 w-4" />,
  'open-quick-open': <Search className="h-4 w-4" />,
  'toggle-workspace-rail': <PanelLeftClose className="h-4 w-4" />,
  'toggle-navigator': <PanelLeft className="h-4 w-4" />,
  'toggle-inspector': <PanelRightClose className="h-4 w-4" />,
  'toggle-key-hints': <Keyboard className="h-4 w-4" />,
  refresh: <RefreshCcw className="h-4 w-4" />,
  'search-notes': <Search className="h-4 w-4" />,
  'navigate-back': <ArrowLeft className="h-4 w-4" />,
  'navigate-forward': <ArrowRight className="h-4 w-4" />,
  'go-history': <History className="h-4 w-4" />,
  'show-trash': <Trash2 className="h-4 w-4" />,
  'export-debug-logs': <FileArchive className="h-4 w-4" />,
  'focus-workspace': <PanelLeft className="h-4 w-4" />,
  'focus-navigator': <FolderTree className="h-4 w-4" />,
  'focus-editor': <PanelRight className="h-4 w-4" />,
  'focus-inspector': <PanelRightClose className="h-4 w-4" />,
  'rename-note': <PencilLine className="h-4 w-4" />,
  'duplicate-note': <Copy className="h-4 w-4" />,
  'move-note-to-folder': <FolderInput className="h-4 w-4" />,
  'reveal-note-in-finder': <FolderSearch className="h-4 w-4" />,
  'copy-note-link': <Link className="h-4 w-4" />,
  'copy-markdown-link': <Link className="h-4 w-4" />,
  'share-note': <Share2 className="h-4 w-4" />,
  'move-tab-left': <ArrowBigLeftDash className="h-4 w-4" />,
  'move-tab-right': <ArrowBigRightDash className="h-4 w-4" />,
  'toggle-book-contents': <PanelLeftDashed className="h-4 w-4" />,
  'close-book': <BookX className="h-4 w-4" />,
  'change-local-vault': <FolderOpen className="h-4 w-4" />,
  'reveal-vault-in-finder': <FolderSearch className="h-4 w-4" />,
  'clear-offline-copies': <DatabaseZap className="h-4 w-4" />,
};

export function CommandPaletteDialog({
  state,
  context,
  folderTree,
  recentNotes,
  teams,
  user,
  scope,
  selectedNoteId,
  selectedFolderId,
  hasHackmdApiToken,
  hasLocalVault,
  themeMode,
  themePresetId,
  themePresets,
  shortcuts,
  platform = navigator.platform,
  onStateChange,
  onRunAction,
  onConnectHackmd,
  onMoveNoteToFolder,
  onOpenSettingsTab,
  onRequestDisconnectHackmd,
  onSelectThemeMode,
  onSelectThemePreset,
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
  user?: Pick<UserSummary, 'name' | 'username' | 'photo'>;
  scope: WorkspaceScope;
  selectedNoteId: string | null;
  selectedFolderId: string | null;
  hasHackmdApiToken: boolean;
  hasLocalVault: boolean;
  themeMode: ThemeMode;
  themePresetId: ThemePresetId;
  themePresets: ThemePreset[];
  shortcuts?: ShortcutOverrides;
  platform?: string;
  onStateChange: (state: CommandPaletteState) => void;
  onRunAction: (actionId: ElectronActionId) => void;
  onConnectHackmd: () => void;
  onMoveNoteToFolder: (folder: QuickOpenFolderResult) => void;
  onOpenSettingsTab: (tab: SettingsTab) => void;
  onRequestDisconnectHackmd: () => void;
  onSelectThemeMode: (mode: ThemeMode) => void;
  onSelectThemePreset: (presetId: ThemePresetId) => void;
  onSelectNote: (entry: FolderTreeNote) => void;
  onSelectRecentNote: (entry: ElectronRecentNote) => void;
  onSelectFolder: (folder: QuickOpenFolderResult) => void;
  onSelectWorkspace: (workspace: QuickOpenWorkspaceResult) => void;
  onShowFinderResults: (query: string) => void;
}) {
  const { characterShortcutsEnabled } = useContext(ActionShortcutContext);
  const pendingContextAction = useRef<ElectronActionId | null>(null);
  const isQuickOpen = state.mode === 'quick-open';
  const isMoveNote = state.mode === 'move-note';
  // Searches beyond notes, folders and workspaces belong to the full palette.
  const isCommands = state.mode === 'commands';
  const trimmedSearch = state.search.trim();
  const hasQuery = trimmedSearch.length > 0;
  const noteSearch = useMemo(
    () => state.open && !isMoveNote ? createQuickOpenNoteSearch(folderTree, recentNotes) : null,
    [state.open, isMoveNote, folderTree, recentNotes],
  );
  const folderSearch = useMemo(
    () => state.open && context.scopeType !== 'history' ? createQuickOpenFolderSearch(folderTree) : null,
    [state.open, context.scopeType, folderTree],
  );
  const noteResults = useMemo(() => noteSearch?.(state.search) ?? [], [noteSearch, state.search]);
  // Moving lists every folder; searching shows the best few.
  const folderResults = useMemo(
    () => folderSearch?.(state.search, isMoveNote ? MOVE_NOTE_FOLDER_LIMIT : undefined) ?? [],
    [folderSearch, isMoveNote, state.search],
  );
  const recentResults = state.open && !isMoveNote ? getQuickOpenRecentNoteResults(recentNotes, state.search) : [];
  const workspaceResults = state.open && !isMoveNote ? getQuickOpenWorkspaceResults(teams, state.search, undefined, hasLocalVault) : [];
  const actionResults = state.open && isCommands
    ? getQuickOpenActionResults(getCommandPaletteActions(), state.search, undefined, (action) => getActionLabel(action, context))
    : [];
  const accountResults = state.open && hasQuery && isCommands ? getAccountCommands(state.search, hasHackmdApiToken) : [];
  const settingsResults = state.open && hasQuery && isCommands ? getSettingsCommands(state.search) : [];
  const themeModeResults = state.open && hasQuery && isCommands ? getThemeModeCommands(state.search, themeMode) : [];
  const themePresetResults = state.open && hasQuery && isCommands
    ? getThemePresetCommands(state.search, themePresets, themePresetId)
    : [];
  const hasAccountResults = accountResults.length > 0;
  const hasAppearanceResults = themeModeResults.length > 0 || themePresetResults.length > 0;
  const showFinderAction = isCommands && shouldShowFinderQuickAction(state.search);
  const dialogTitle = isQuickOpen ? 'Quick Open' : isMoveNote ? 'Move Note to Folder' : 'Command Palette';
  const dialogDescription = isQuickOpen
    ? 'Search notes, folders, and workspaces.'
    : isMoveNote
      ? 'Choose the folder to move the selected note to.'
      : 'Search notes, folders, workspaces, and commands.';
  const searchLabel = isQuickOpen
    ? 'Search notes, folders, and workspaces'
    : isMoveNote
      ? 'Search folders'
      : 'Search notes, folders, and commands';

  const closePalette = () => onStateChange({ mode: 'commands', open: false, search: '' });

  return (
    <Dialog
      open={state.open}
      onOpenChangeComplete={open => {
        if (open || !pendingContextAction.current) return;
        // Context actions need the Workbench to be focusable after modal cleanup.
        const action = pendingContextAction.current;
        pendingContextAction.current = null;
        onRunAction(action);
      }}
      onOpenChange={(open) => onStateChange(
        open ? { ...state, open } : { mode: 'commands', open: false, search: '' },
      )}
    >
      <DialogContent placement="top" className="max-w-xl overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <Command label={searchLabel} shouldFilter={false}>
          <CommandInput
            autoFocus
            value={state.search}
            onValueChange={(search) => onStateChange({ ...state, search })}
            placeholder={`${searchLabel}…`}
            trailing={(
              <DialogClose
                aria-label={`Close ${dialogTitle.toLowerCase()}`}
                className={`inline-flex size-8 items-center justify-center p-0 ${FOCUS_RING_CLASS}`}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </DialogClose>
            )}
          />
          <CommandList className="overscroll-contain">
            <CommandEmpty>{isQuickOpen ? 'No notes, folders, or workspaces found.' : isMoveNote ? 'No folders found.' : 'No commands found.'}</CommandEmpty>
            {!hasQuery && recentResults.length > 0 ? (
              <CommandGroup heading="Recent Notes">
                {recentResults.map((entry) => {
                  const workspaceLabel = entry.teamPath ? `Team: ${entry.teamPath}` : 'My Workspace';

                  return (
                    <CommandItem
                      key={`recent:${entry.teamPath ?? 'personal'}:${entry.noteId}`}
                      value={`recent note ${entry.title} ${workspaceLabel} ${entry.shortId}`}
                      onSelect={() => {
                        onSelectRecentNote(entry);
                        closePalette();
                      }}
                    >
                      <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}><History className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className={COMMAND_ITEM_TITLE_CLASS}>{entry.title || 'Untitled'}</span>
                        <span className={COMMAND_ITEM_META_CLASS}>{workspaceLabel}</span>
                      </span>
                      {selectedNoteId === entry.noteId ? (
                        <span className="ml-auto inline-flex shrink-0 items-center text-primary-default">
                          <Check aria-hidden="true" className="h-4 w-4" />
                          <span className="sr-only">Current note</span>
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {hasQuery && noteResults.length > 0 ? (
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
                  ].filter(Boolean).join(' · ');

                  return (
                    <CommandItem
                      key={`note:${entry.note.id}:${entry.folderLabel}`}
                      value={`note ${entry.note.title} ${metadata} ${entry.note.shortId}`}
                      onSelect={() => {
                        onSelectNote(entry);
                        closePalette();
                      }}
                    >
                      <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className={COMMAND_ITEM_TITLE_CLASS}><HighlightedText text={entry.note.title || 'Untitled'} query={trimmedSearch} /></span>
                        <span className={COMMAND_ITEM_META_CLASS}><HighlightedText text={metadata} query={trimmedSearch} acronym={false} /></span>
                      </span>
                      {selectedNoteId === entry.note.id ? (
                        <span className="ml-auto inline-flex shrink-0 items-center text-primary-default">
                          <Check aria-hidden="true" className="h-4 w-4" />
                          <span className="sr-only">Current note</span>
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {(hasQuery || isMoveNote) && folderResults.length > 0 ? (
              <CommandGroup heading={isMoveNote ? 'Move to' : 'Folders'}>
                {folderResults.map((folder) => (
                  <CommandItem
                    key={`folder:${folder.id}`}
                    value={`folder ${folder.label}`}
                    onSelect={() => {
                      if (isMoveNote) onMoveNoteToFolder(folder);
                      else onSelectFolder(folder);
                      closePalette();
                    }}
                  >
                    <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}><Folder className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={COMMAND_ITEM_TITLE_CLASS}><HighlightedText text={folder.name} query={trimmedSearch} /></span>
                      <span className={COMMAND_ITEM_META_CLASS}>
                        {folder.label}{folder.noteCount > 0 ? ` · ${folder.noteCount} ${folder.noteCount === 1 ? 'note' : 'notes'}` : ''}
                      </span>
                    </span>
                    {!isMoveNote && selectedFolderId === folder.id ? (
                      <span className="ml-auto inline-flex shrink-0 items-center text-primary-default">
                        <Check aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">Current folder</span>
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {workspaceResults.length > 0 ? (
              <CommandGroup heading="Workspaces">
                {workspaceResults.map((workspace) => {
                  const selected = workspace.type === scope.type
                    && (workspace.type !== 'team' || (scope.type === 'team' && scope.teamPath === workspace.teamPath));
                  const team = workspace.type === 'team'
                    ? teams.find((candidate) => candidate.path === workspace.teamPath)
                    : undefined;

                  return (
                    <CommandItem
                      key={`workspace:${workspace.id}`}
                      value={`workspace ${workspace.label} ${workspace.description}`}
                      onSelect={() => {
                        onSelectWorkspace(workspace);
                        closePalette();
                      }}
                    >
                      <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}>
                        {workspace.type === 'history'
                          ? <History className="h-4 w-4" />
                          : workspace.type === 'local'
                            ? <Folder className="h-4 w-4" />
                            : team
                            ? <TeamWorkspaceIcon team={team} className="size-5" testId={`command-palette-team-logo-${team.id}`} />
                            : <PersonalWorkspaceIcon user={user} className="size-5" testId="command-palette-personal-avatar" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={COMMAND_ITEM_TITLE_CLASS}><HighlightedText text={workspace.label} query={trimmedSearch} /></span>
                        <span className={COMMAND_ITEM_META_CLASS}><HighlightedText text={workspace.description} query={trimmedSearch} acronym={false} /></span>
                      </span>
                      {selected ? (
                        <span className="ml-auto inline-flex shrink-0 items-center text-primary-default">
                          <Check aria-hidden="true" className="h-4 w-4" />
                          <span className="sr-only">Current workspace</span>
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {actionResults.length > 0 ? (
              <CommandGroup heading={hasQuery ? 'Actions' : 'Quick Actions'}>
                {actionResults.map((action) => {
                  const disabledReason = getActionDisabledReason(action, context);
                  const actionLabel = getActionLabel(action, context);
                  const shortcut = getResolvedActionShortcut(action.id, shortcuts, platform, characterShortcutsEnabled);

                  return (
                    <CommandItem
                      key={action.id}
                      value={`${action.label} ${actionLabel} ${action.keywords.join(' ')}`}
                      disabled={Boolean(disabledReason)}
                      onSelect={() => {
                        if (disabledReason) {
                          return;
                        }

                        if (action.id === 'open-quick-open' || action.id === 'move-note-to-folder') {
                          onStateChange({ mode: action.id === 'open-quick-open' ? 'quick-open' : 'move-note', open: true, search: '' });
                          return;
                        }

                        if (action.keyboardContext === 'region' || action.keyboardContext === 'scroll') {
                          pendingContextAction.current = action.id;
                        } else {
                          onRunAction(action.id);
                        }
                        closePalette();
                      }}
                    >
                      <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}>{ACTION_ICONS[action.id]}</span>
                      <span className="min-w-0 flex-1">
                        <span className={COMMAND_ITEM_TITLE_CLASS}><HighlightedText text={actionLabel} query={trimmedSearch} /></span>
                        <span className={COMMAND_ITEM_META_CLASS}>
                          {disabledReason ?? <HighlightedText text={action.description} query={trimmedSearch} acronym={false} />}
                        </span>
                      </span>
                      {shortcut ? <CommandShortcut>{shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {hasAccountResults ? (
              <CommandGroup heading="Account">
                {accountResults.map((command) => (
                  <CommandItem
                    key={`account:${command.id}`}
                    value={`${command.label} ${command.description} ${command.keywords.join(' ')}`}
                    onSelect={() => {
                      if (command.id === 'connect-hackmd') {
                        onConnectHackmd();
                      } else {
                        onRequestDisconnectHackmd();
                      }

                      closePalette();
                    }}
                  >
                    <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}>{command.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className={COMMAND_ITEM_TITLE_CLASS}><HighlightedText text={command.label} query={trimmedSearch} /></span>
                      <span className={COMMAND_ITEM_META_CLASS}>{command.description}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {settingsResults.length > 0 ? (
              <CommandGroup heading="Settings">
                {settingsResults.map((command) => (
                  <CommandItem
                    key={`settings:${command.id}`}
                    value={`${command.label} ${command.description} ${command.keywords.join(' ')}`}
                    onSelect={() => {
                      closePalette();
                      onOpenSettingsTab(command.id);
                    }}
                  >
                    <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}>{command.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className={COMMAND_ITEM_TITLE_CLASS}><HighlightedText text={command.label} query={trimmedSearch} /></span>
                      <span className={COMMAND_ITEM_META_CLASS}>{command.description}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {hasAppearanceResults ? (
              <CommandGroup heading="Appearance">
                {themeModeResults.map((command) => (
                  <CommandItem
                    key={`theme-mode:${command.mode}`}
                    value={`${command.label} ${command.description} ${command.mode} ${command.keywords.join(' ')}`}
                    disabled={command.active}
                    onSelect={() => {
                      if (command.active) {
                        return;
                      }

                      onSelectThemeMode(command.mode);
                      closePalette();
                    }}
                  >
                    <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}>{command.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className={COMMAND_ITEM_TITLE_CLASS}><HighlightedText text={command.label} query={trimmedSearch} /></span>
                      <span className={COMMAND_ITEM_META_CLASS}>
                        {command.active ? 'Current appearance · Already active' : command.description}
                      </span>
                    </span>
                    {command.active ? (
                      <span className="ml-auto inline-flex shrink-0 items-center text-primary-default">
                        <Check aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">Current appearance</span>
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
                {themePresetResults.map((command) => (
                  <CommandItem
                    key={`theme-preset:${command.id}`}
                    value={`${command.label} ${command.description} ${command.id} theme appearance palette`}
                    disabled={command.active}
                    onSelect={() => {
                      if (command.active) {
                        return;
                      }

                      onSelectThemePreset(command.id);
                      closePalette();
                    }}
                  >
                    <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}><Palette className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={COMMAND_ITEM_TITLE_CLASS}><HighlightedText text={command.label} query={trimmedSearch} /></span>
                      <span className={COMMAND_ITEM_META_CLASS}>
                        {command.active ? 'Current theme · Already active' : command.description}
                      </span>
                    </span>
                    {command.active ? (
                      <span className="ml-auto inline-flex shrink-0 items-center text-primary-default">
                        <Check aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">Current theme</span>
                      </span>
                    ) : null}
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
                  <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}><Search className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className={COMMAND_ITEM_TITLE_CLASS}>{`Show Finder Results for “${trimmedSearch}”`}</span>
                    <span className={COMMAND_ITEM_META_CLASS}>Filter the current workspace in the navigator.</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
