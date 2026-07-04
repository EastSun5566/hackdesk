import {
  FileText,
  FileArchive,
  Download,
  Folder,
  FolderOpen,
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
  Sun,
  Settings2,
  ArrowLeftRight,
  ArrowLeft,
  ArrowRight,
  Check,
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
  DialogClose,
  DialogContent,
  DialogDescription,
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
import type { ThemeMode, ThemePreset, ThemePresetId } from '@/lib/themes';

import type { CommandPaletteState, WorkspaceScope } from './types';
import { FOCUS_RING_CLASS } from './ui';

const COMMAND_ITEM_ICON_CLASS = 'mr-3 text-text-subtle';
const COMMAND_ITEM_TITLE_CLASS = 'block truncate font-medium text-[color:var(--command-item-title)]';
const COMMAND_ITEM_META_CLASS = 'block truncate text-xs text-[color:var(--command-item-meta)]';

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

function normalizeCommandQuery(query: string) {
  return query.trim().toLowerCase();
}

function commandMatches(query: string, fields: Array<string | null | undefined>) {
  const normalizedQuery = normalizeCommandQuery(query);
  if (!normalizedQuery) {
    return false;
  }

  return fields.join(' ').toLowerCase().includes(normalizedQuery);
}

function getThemeModeCommands(query: string, activeMode: ThemeMode) {
  return THEME_MODE_COMMANDS
    .filter((command) => commandMatches(query, [
      command.label,
      command.description,
      command.mode,
      ...command.keywords,
    ]))
    .map((command) => ({
      ...command,
      active: command.mode === activeMode,
    }));
}

function getThemePresetCommands(query: string, presets: ThemePreset[], activePresetId: ThemePresetId) {
  return presets
    .filter((preset) => commandMatches(query, [
      preset.id,
      preset.name,
      preset.description,
      'theme',
      'appearance',
      'palette',
    ]))
    .map((preset) => ({
      id: preset.id,
      label: `Use Theme: ${preset.name}`,
      description: preset.description,
      active: preset.id === activePresetId,
    }));
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

  return commandMatches(query, [command.label, command.description, ...command.keywords]) ? [command] : [];
}

function getLocalVaultCommands(query: string, hasLocalVault: boolean) {
  const command = hasLocalVault
    ? {
        id: 'switch-local-vault' as const,
        label: 'Switch to Local Vault',
        description: 'Open your configured local Markdown folder.',
        keywords: ['local', 'vault', 'folder', 'offline', 'workspace', 'switch'],
        icon: <Folder className="h-4 w-4" />,
      }
    : {
        id: 'open-local-folder' as const,
        label: 'Open Local Folder',
        description: 'Choose a local Markdown folder to use in HackDesk.',
        keywords: ['local', 'vault', 'folder', 'offline', 'open', 'picker'],
        icon: <FolderOpen className="h-4 w-4" />,
      };

  return commandMatches(query, [command.label, command.description, ...command.keywords]) ? [command] : [];
}

function getCurrentNoteCommands(query: string, {
  currentNoteIsRemote,
  hasCurrentNote,
}: {
  currentNoteIsRemote: boolean;
  hasCurrentNote: boolean;
}) {
  if (!hasCurrentNote) {
    return [];
  }

  const commands = [
    {
      id: 'copy-note-link' as const,
      label: 'Copy Note Link',
      description: 'Copy the HackMD link for the current note.',
      keywords: ['copy', 'link', 'url', 'note', 'current', 'hackmd'],
      icon: <Link className="h-4 w-4" />,
    },
    {
      id: 'copy-markdown-link' as const,
      label: 'Copy Markdown Link',
      description: 'Copy a Markdown link for the current note.',
      keywords: ['copy', 'markdown', 'link', 'note', 'current'],
      icon: <Link className="h-4 w-4" />,
    },
    ...(currentNoteIsRemote
      ? [{
          id: 'share-note' as const,
          label: 'Share Note…',
          description: 'Open sharing settings for the current note.',
          keywords: ['share', 'access', 'permission', 'note', 'current'],
          icon: <Share2 className="h-4 w-4" />,
        }]
      : []),
  ];

  return commands.filter((command) => commandMatches(query, [
    command.label,
    command.description,
    ...command.keywords,
  ]));
}

const ACTION_ICONS: Record<ElectronActionId, ReactNode> = {
  'new-tab': <FileText className="h-4 w-4" />,
  'new-note': <FileText className="h-4 w-4" />,
  'new-folder': <FolderPlus className="h-4 w-4" />,
  'rename-folder': <FolderPen className="h-4 w-4" />,
  'delete-folder': <Trash2 className="h-4 w-4" />,
  'save-note': <Save className="h-4 w-4" />,
  'find-in-note': <Search className="h-4 w-4" />,
  'attach-image': <ImagePlus className="h-4 w-4" />,
  'export-note-markdown': <Download className="h-4 w-4" />,
  'import-markdown-note': <Upload className="h-4 w-4" />,
  'open-note-web-editor': <FileText className="h-4 w-4" />,
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
  'open-command-palette': <Keyboard className="h-4 w-4" />,
  'toggle-workspace-rail': <PanelLeftClose className="h-4 w-4" />,
  'toggle-navigator': <PanelLeft className="h-4 w-4" />,
  'toggle-inspector': <PanelRightClose className="h-4 w-4" />,
  refresh: <RefreshCcw className="h-4 w-4" />,
  'search-notes': <Search className="h-4 w-4" />,
  'navigate-back': <ArrowLeft className="h-4 w-4" />,
  'navigate-forward': <ArrowRight className="h-4 w-4" />,
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
  currentNoteIsRemote,
  hasCurrentNote,
  hasHackmdApiToken,
  hasLocalVault,
  themeMode,
  themePresetId,
  themePresets,
  onStateChange,
  onRunAction,
  onConnectHackmd,
  onCopyCurrentNoteLink,
  onCopyCurrentNoteMarkdownLink,
  onOpenLocalFolder,
  onRequestDisconnectHackmd,
  onShareCurrentNote,
  onSelectThemeMode,
  onSelectThemePreset,
  onSwitchLocalVault,
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
  currentNoteIsRemote: boolean;
  hasCurrentNote: boolean;
  hasHackmdApiToken: boolean;
  hasLocalVault: boolean;
  themeMode: ThemeMode;
  themePresetId: ThemePresetId;
  themePresets: ThemePreset[];
  onStateChange: (state: CommandPaletteState) => void;
  onRunAction: (actionId: ElectronActionId) => void;
  onConnectHackmd: () => void;
  onCopyCurrentNoteLink: () => void;
  onCopyCurrentNoteMarkdownLink: () => void;
  onOpenLocalFolder: () => void;
  onRequestDisconnectHackmd: () => void;
  onShareCurrentNote: () => void;
  onSelectThemeMode: (mode: ThemeMode) => void;
  onSelectThemePreset: (presetId: ThemePresetId) => void;
  onSwitchLocalVault: () => void;
  onSelectNote: (entry: FolderTreeNote) => void;
  onSelectRecentNote: (entry: ElectronRecentNote) => void;
  onSelectFolder: (folder: QuickOpenFolderResult) => void;
  onSelectWorkspace: (workspace: QuickOpenWorkspaceResult) => void;
  onShowFinderResults: (query: string) => void;
}) {
  const trimmedSearch = state.search.trim();
  const hasQuery = trimmedSearch.length > 0;
  const recentResults = getQuickOpenRecentNoteResults(recentNotes, state.search);
  const workspaceResults = getQuickOpenWorkspaceResults(teams, state.search);
  const noteResults = getQuickOpenNoteResults(folderTree, state.search, undefined, recentNotes);
  const folderResults = context.scopeType === 'history' ? [] : getQuickOpenFolderResults(folderTree, state.search);
  const actionResults = getQuickOpenActionResults(getCommandPaletteActions(), state.search);
  const accountResults = hasQuery ? getAccountCommands(state.search, hasHackmdApiToken) : [];
  const localVaultResults = hasQuery ? getLocalVaultCommands(state.search, hasLocalVault) : [];
  const currentNoteResults = hasQuery
    ? getCurrentNoteCommands(state.search, { currentNoteIsRemote, hasCurrentNote })
    : [];
  const themeModeResults = hasQuery ? getThemeModeCommands(state.search, themeMode) : [];
  const themePresetResults = hasQuery ? getThemePresetCommands(state.search, themePresets, themePresetId) : [];
  const hasAccountResults = accountResults.length > 0;
  const hasLocalVaultResults = localVaultResults.length > 0;
  const hasCurrentNoteResults = currentNoteResults.length > 0;
  const hasAppearanceResults = themeModeResults.length > 0 || themePresetResults.length > 0;
  const showFinderAction = shouldShowFinderQuickAction(state.search);

  const closePalette = () => onStateChange({ open: false, search: '' });

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onStateChange(open ? { ...state, open } : { open: false, search: '' })}
    >
      <DialogContent className="mt-[12dvh] max-w-xl self-start overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>Search notes, folders, workspaces, and commands.</DialogDescription>
        </DialogHeader>
        <Command label="Search notes, folders, and commands" shouldFilter={false}>
          <CommandInput
            autoFocus
            value={state.search}
            onValueChange={(search) => onStateChange({ ...state, search })}
            placeholder="Search notes, folders, and commands…"
            trailing={(
              <DialogClose
                aria-label="Close command palette"
                className={`inline-flex size-8 items-center justify-center p-0 ${FOCUS_RING_CLASS}`}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </DialogClose>
            )}
          />
          <CommandList className="overscroll-contain">
            <CommandEmpty>No commands found.</CommandEmpty>
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
                        <span className={COMMAND_ITEM_TITLE_CLASS}>{entry.note.title || 'Untitled'}</span>
                        <span className={COMMAND_ITEM_META_CLASS}>{metadata}</span>
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

            {hasQuery && folderResults.length > 0 ? (
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
                    <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}><Folder className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={COMMAND_ITEM_TITLE_CLASS}>{folder.name}</span>
                      <span className={COMMAND_ITEM_META_CLASS}>
                        {folder.label}{folder.noteCount > 0 ? ` · ${folder.noteCount} ${folder.noteCount === 1 ? 'note' : 'notes'}` : ''}
                      </span>
                    </span>
                    {selectedFolderId === folder.id ? (
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
                          : workspace.type === 'team'
                            ? <Users className="h-4 w-4" />
                            : <Folder className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={COMMAND_ITEM_TITLE_CLASS}>{workspace.label}</span>
                        <span className={COMMAND_ITEM_META_CLASS}>{workspace.description}</span>
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
                      <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}>{ACTION_ICONS[action.id]}</span>
                      <span className="min-w-0 flex-1">
                        <span className={COMMAND_ITEM_TITLE_CLASS}>{actionLabel}</span>
                        <span className={COMMAND_ITEM_META_CLASS}>
                          {disabledReason ?? action.description}
                        </span>
                      </span>
                      {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {hasCurrentNoteResults ? (
              <CommandGroup heading="Current Note">
                {currentNoteResults.map((command) => (
                  <CommandItem
                    key={`current-note:${command.id}`}
                    value={`${command.label} ${command.description} ${command.keywords.join(' ')}`}
                    onSelect={() => {
                      if (command.id === 'copy-note-link') {
                        onCopyCurrentNoteLink();
                      } else if (command.id === 'copy-markdown-link') {
                        onCopyCurrentNoteMarkdownLink();
                      } else {
                        onShareCurrentNote();
                      }

                      closePalette();
                    }}
                  >
                    <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}>{command.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className={COMMAND_ITEM_TITLE_CLASS}>{command.label}</span>
                      <span className={COMMAND_ITEM_META_CLASS}>{command.description}</span>
                    </span>
                  </CommandItem>
                ))}
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
                      <span className={COMMAND_ITEM_TITLE_CLASS}>{command.label}</span>
                      <span className={COMMAND_ITEM_META_CLASS}>{command.description}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {hasLocalVaultResults ? (
              <CommandGroup heading="Local">
                {localVaultResults.map((command) => (
                  <CommandItem
                    key={`local:${command.id}`}
                    value={`${command.label} ${command.description} ${command.keywords.join(' ')}`}
                    onSelect={() => {
                      if (command.id === 'open-local-folder') {
                        onOpenLocalFolder();
                      } else {
                        onSwitchLocalVault();
                      }

                      closePalette();
                    }}
                  >
                    <span aria-hidden="true" className={COMMAND_ITEM_ICON_CLASS}>{command.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className={COMMAND_ITEM_TITLE_CLASS}>{command.label}</span>
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
                      <span className={COMMAND_ITEM_TITLE_CLASS}>{command.label}</span>
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
                      <span className={COMMAND_ITEM_TITLE_CLASS}>{command.label}</span>
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
