import {
  ArrowLeftCircle,
  ArrowRight,
  ArrowRightCircle,
  Clock,
  Cross,
  FileText,
  FolderSearch,
  RefreshCcw,
  Settings,
} from 'lucide-react';

const COMMAND_ICON_CLASS = 'mr-2 h-4 w-4';
const RECENT_COMMANDS_KEY = 'hackdesk_recent_commands';
const RECENT_NOTES_KEY = 'hackdesk_recent_notes';
const MAX_RECENT_COMMANDS = 5;
const MAX_RECENT_NOTES = 5;

export type CommandCategory = 'navigation' | 'action' | 'settings' | 'hackmd';

export interface CommandConfig {
  value: string;
  label: string;
  Icon: React.ReactNode;
  shortcut?: string;
  category: CommandCategory;
  keywords?: string[];
}

export interface GroupedCommands {
  recent: CommandConfig[];
  navigation: CommandConfig[];
  action: CommandConfig[];
  settings: CommandConfig[];
  hackmd: CommandConfig[];
}

const navigationCommands: CommandConfig[] = [
  {
    value: '/new',
    label: 'New Note',
    Icon: <Cross className={COMMAND_ICON_CLASS} />,
    shortcut: '⌘ N',
    category: 'navigation',
    keywords: ['create', 'add', 'note'],
  },
  {
    value: '/',
    label: 'Go to my notes',
    Icon: <FileText className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['home', 'notes', 'list'],
  },
  {
    value: '/?nav=collab',
    label: 'Go to my collaborations',
    Icon: <ArrowRight className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['shared', 'team', 'collaborate'],
  },
  {
    value: '/?nav=trash',
    label: 'Go to my trash',
    Icon: <ArrowRight className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['deleted', 'bin', 'remove'],
  },
  {
    value: '/bookmark',
    label: 'Go to my bookmarks',
    Icon: <ArrowRight className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['starred', 'favorites', 'saved'],
  },
  {
    value: '/recent',
    label: 'Go to my history',
    Icon: <Clock className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['recent', 'history', 'past'],
  },
  {
    value: '/?nav=myTeams',
    label: 'Go to my teams',
    Icon: <ArrowRight className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['teams', 'groups', 'workspace'],
  },
  {
    value: '/s/release-notes',
    label: 'Show release notes',
    Icon: <ArrowRight className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['changelog', 'updates', 'news'],
  },
];

const actionCommands: CommandConfig[] = [
  {
    value: 'forward',
    label: 'Go forward',
    Icon: <ArrowRightCircle className={COMMAND_ICON_CLASS} />,
    category: 'action',
    keywords: ['next', 'forward', 'ahead'],
  },
  {
    value: 'back',
    label: 'Go back',
    Icon: <ArrowLeftCircle className={COMMAND_ICON_CLASS} />,
    category: 'action',
    keywords: ['previous', 'back', 'return'],
  },
  {
    value: 'reload',
    label: 'Reload',
    Icon: <RefreshCcw className={COMMAND_ICON_CLASS} />,
    shortcut: '⌘ R',
    category: 'action',
    keywords: ['refresh', 'reload', 'update'],
  },
];

const settingsCommands: CommandConfig[] = [
  {
    value: '/settings',
    label: 'Open Settings',
    Icon: <Settings className={COMMAND_ICON_CLASS} />,
    shortcut: '⌘ ,',
    category: 'settings',
    keywords: ['preferences', 'config', 'options'],
  },
];

const hackmdCommands: CommandConfig[] = [
  {
    value: 'hackmd:notes',
    label: 'Manage Notes',
    Icon: <FolderSearch className={COMMAND_ICON_CLASS} />,
    category: 'hackmd',
    keywords: ['hackmd', 'notes', 'browse', 'search', 'create', 'delete'],
  },
];

export function getAllCommands({ hasHackmdToken = false }: { hasHackmdToken?: boolean } = {}) {
  return [
    ...navigationCommands,
    ...actionCommands,
    ...settingsCommands,
    ...(hasHackmdToken ? hackmdCommands : []),
  ];
}

export function findCommand(value: string, commands = getAllCommands()) {
  return commands.find((command) => command.value === value);
}

export function getRecentCommands(storage: Storage = window.localStorage): string[] {
  try {
    const recent = storage.getItem(RECENT_COMMANDS_KEY);
    return recent ? (JSON.parse(recent) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveRecentCommand(value: string, storage: Storage = window.localStorage) {
  try {
    const recent = getRecentCommands(storage);
    const filtered = recent.filter((recentValue) => recentValue !== value);
    const updated = [value, ...filtered].slice(0, MAX_RECENT_COMMANDS);
    storage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save recent command:', error);
  }
}

export function groupCommands(
  search: string,
  searchResults: CommandConfig[],
  recentValues: string[],
  availableCommands: CommandConfig[],
): GroupedCommands {
  const groups: GroupedCommands = {
    recent: [],
    navigation: [],
    action: [],
    settings: [],
    hackmd: [],
  };

  if (!search && recentValues.length > 0) {
    groups.recent = recentValues
      .map((value) => findCommand(value, availableCommands))
      .filter((command): command is CommandConfig => command !== undefined);
  }

  searchResults.forEach((command) => {
    if (!groups.recent.find((recentCommand) => recentCommand.value === command.value)) {
      groups[command.category].push(command);
    }
  });

  return groups;
}

export function getRecentNotes(storage: Storage = window.localStorage): string[] {
  try {
    const recent = storage.getItem(RECENT_NOTES_KEY);
    return recent ? (JSON.parse(recent) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveRecentNote(noteId: string, storage: Storage = window.localStorage) {
  try {
    const recent = getRecentNotes(storage);
    const filtered = recent.filter((value) => value !== noteId);
    const updated = [noteId, ...filtered].slice(0, MAX_RECENT_NOTES);
    storage.setItem(RECENT_NOTES_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save recent note:', error);
  }
}

export function removeRecentNote(noteId: string, storage: Storage = window.localStorage) {
  try {
    const recent = getRecentNotes(storage);
    storage.setItem(
      RECENT_NOTES_KEY,
      JSON.stringify(recent.filter((value) => value !== noteId)),
    );
  } catch (error) {
    console.error('Failed to remove recent note:', error);
  }
}