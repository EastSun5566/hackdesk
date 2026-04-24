import {
  Activity,
  ArrowLeftCircle,
  ArrowRight,
  ArrowRightCircle,
  Clock,
  CreditCard,
  Cross,
  FileText,
  FolderSearch,
  RefreshCcw,
  Search,
  Settings,
  ShoppingCart,
  User,
  Users,
} from 'lucide-react';

const COMMAND_ICON_CLASS = 'mr-2 h-4 w-4';
const RECENT_COMMANDS_KEY = 'hackdesk_recent_commands';
const RECENT_NOTES_KEY = 'hackdesk_recent_notes';
const MAX_RECENT_COMMANDS = 5;
const MAX_RECENT_NOTES = 5;

export interface RecentNoteEntry {
  noteId: string;
  teamPath?: string | null;
  legacy?: true;
}

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

function createSettingsRouteCommand(
  hash: string,
  label: string,
  keywords: string[],
): CommandConfig {
  return {
    value: `/settings#${hash}`,
    label,
    Icon: <Settings className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords,
  };
}

const settingsNavigationCommands: CommandConfig[] = [
  createSettingsRouteCommand('general', 'Go to general settings', ['settings', 'general', 'preferences', 'profile']),
  createSettingsRouteCommand('note', 'Go to note settings', ['settings', 'note', 'editor', 'markdown']),
  createSettingsRouteCommand('network', 'Go to network settings', ['settings', 'network', 'proxy', 'connection']),
  createSettingsRouteCommand('notification', 'Go to notification settings', ['settings', 'notification', 'email', 'alerts']),
  createSettingsRouteCommand('api', 'Go to API settings', ['settings', 'api', 'token', 'developer']),
  createSettingsRouteCommand('integration', 'Go to integration settings', ['settings', 'integration', 'github', 'gitlab', 'sync']),
  createSettingsRouteCommand('preview-features', 'Go to preview features', ['settings', 'preview', 'features', 'beta']),
  createSettingsRouteCommand('appearance', 'Go to appearance settings', ['settings', 'appearance', 'theme', 'display']),
];

const settingsNavigationKeywords = Array.from(
  new Set(settingsNavigationCommands.flatMap((command) => command.keywords ?? [])),
);

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
    value: '/?nav=my-activity',
    label: 'Go to my activity',
    Icon: <Activity className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['activity', 'updates', 'timeline', 'collaboration'],
  },
  {
    value: '/?nav=search',
    label: 'Search my notes',
    Icon: <Search className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['search', 'find', 'query', 'notes'],
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
    value: 'hackmd:settings',
    label: 'Go to my settings',
    Icon: <Settings className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['my settings', 'settings', 'account', 'preferences', 'profile settings', ...settingsNavigationKeywords],
  },
  {
    value: '/?nav=billing',
    label: 'Go to billing',
    Icon: <CreditCard className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['billing', 'subscription', 'payment', 'invoice'],
  },
  {
    value: '/?nav=purchase',
    label: 'Go to purchase',
    Icon: <ShoppingCart className={COMMAND_ICON_CLASS} />,
    category: 'navigation',
    keywords: ['purchase', 'upgrade', 'plan', 'checkout'],
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
    value: 'hackdesk:settings',
    label: 'Open HackDesk Settings',
    Icon: <Settings className={COMMAND_ICON_CLASS} />,
    shortcut: '⌘ ,',
    category: 'settings',
    keywords: ['preferences', 'config', 'options', 'local settings'],
  },
];

const hackmdCommands: CommandConfig[] = [
  {
    value: 'hackmd:notes',
    label: 'Manage Notes',
    Icon: <FolderSearch className={COMMAND_ICON_CLASS} />,
    category: 'hackmd',
    keywords: ['hackmd', 'notes', 'browse', 'search', 'create', 'delete', 'teams', 'workspace'],
  },
  {
    value: 'hackmd:team-navigation',
    label: 'Team Navigation',
    Icon: <Users className={COMMAND_ICON_CLASS} />,
    category: 'hackmd',
    keywords: ['team', 'workspace', 'routes', 'navigation', 'manage', 'search', 'trash'],
  },
];

function getDynamicNavigationCommands(profilePath?: string | null): CommandConfig[] {
  if (!profilePath) {
    return [];
  }

  return [
    {
      value: profilePath,
      label: 'Go to my profile',
      Icon: <User className={COMMAND_ICON_CLASS} />,
      category: 'navigation',
      keywords: ['profile', 'account', 'me', 'user'],
    },
  ];
}

export function getSettingsNavigationCommands() {
  return settingsNavigationCommands;
}

export function getAllCommands({
  hasHackmdToken = false,
  profilePath,
}: {
  hasHackmdToken?: boolean;
  profilePath?: string | null;
} = {}) {
  return [
    ...navigationCommands,
    ...getDynamicNavigationCommands(profilePath),
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

export function getRecentNotes(storage: Storage = window.localStorage): RecentNoteEntry[] {
  try {
    const recent = storage.getItem(RECENT_NOTES_KEY);
    if (!recent) {
      return [];
    }

    const parsed = JSON.parse(recent) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap<RecentNoteEntry>((entry) => {
      if (typeof entry === 'string') {
        return entry.trim()
          ? [{ noteId: entry, legacy: true }]
          : [];
      }

      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const noteId = 'noteId' in entry && typeof entry.noteId === 'string'
        ? entry.noteId.trim()
        : '';

      if (!noteId) {
        return [];
      }

      const teamPath = 'teamPath' in entry
        ? typeof entry.teamPath === 'string'
          ? entry.teamPath.trim() || null
          : entry.teamPath === null
            ? null
            : undefined
        : undefined;

      if (teamPath === undefined) {
        return [{ noteId, legacy: true }];
      }

      return [{ noteId, teamPath }];
    });
  } catch {
    return [];
  }
}

function serializeRecentNotes(recentNotes: RecentNoteEntry[]) {
  return recentNotes.map((entry) => entry.legacy
    ? entry.noteId
    : {
      noteId: entry.noteId,
      teamPath: entry.teamPath ?? null,
    });
}

function createScopedRecentNoteEntry(noteId: string, teamPath: string | null): RecentNoteEntry | null {
  const normalizedNoteId = noteId.trim();

  if (!normalizedNoteId) {
    return null;
  }

  return {
    noteId: normalizedNoteId,
    teamPath: teamPath?.trim() || null,
  };
}

export function saveRecentNote(
  noteId: string,
  teamPath: string | null,
  storage: Storage = window.localStorage,
) {
  try {
    const nextEntry = createScopedRecentNoteEntry(noteId, teamPath);

    if (!nextEntry) {
      return;
    }

    const recent = getRecentNotes(storage);
    const filtered = recent.filter((entry) => {
      if (entry.legacy) {
        return entry.noteId !== nextEntry.noteId;
      }

      return !(entry.noteId === nextEntry.noteId && entry.teamPath === nextEntry.teamPath);
    });
    const updated = [nextEntry, ...filtered].slice(0, MAX_RECENT_NOTES);
    storage.setItem(RECENT_NOTES_KEY, JSON.stringify(serializeRecentNotes(updated)));
  } catch (error) {
    console.error('Failed to save recent note:', error);
  }
}

export function removeRecentNote(
  noteId: string,
  teamPath: string | null,
  storage: Storage = window.localStorage,
) {
  try {
    const targetEntry = createScopedRecentNoteEntry(noteId, teamPath);

    if (!targetEntry) {
      return;
    }

    const recent = getRecentNotes(storage);
    storage.setItem(
      RECENT_NOTES_KEY,
      JSON.stringify(serializeRecentNotes(recent.filter((entry) => {
        if (entry.legacy) {
          return entry.noteId !== targetEntry.noteId;
        }

        return !(entry.noteId === targetEntry.noteId && entry.teamPath === targetEntry.teamPath);
      }))),
    );
  } catch (error) {
    console.error('Failed to remove recent note:', error);
  }
}