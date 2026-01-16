import { useEffect, useMemo, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import Fuse from 'fuse.js';
import {
  Cross,
  ArrowRight,
  ArrowRightCircle,
  ArrowLeftCircle,
  RefreshCcw,
  Settings,
  Sun,
  Moon,
  Clock,
  FileText,
} from 'lucide-react';

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

interface CommandConfig {
  value: string;
  label: string;
  Icon: React.ReactNode;
  shortcut?: string;
  category: 'navigation' | 'action' | 'settings';
  keywords?: string[];
}

const NAVIGATION_COMMANDS: CommandConfig[] = [
  {
    value: '/new',
    label: 'New Note',
    Icon: <Cross className="mr-2 h-4 w-4" />,
    shortcut: '⌘ N',
    category: 'navigation',
    keywords: ['create', 'add', 'note'],
  },
  {
    value: '/',
    label: 'Go to my notes',
    Icon: <FileText className="mr-2 h-4 w-4" />,
    category: 'navigation',
    keywords: ['home', 'notes', 'list'],
  },
  {
    value: '/?nav=collab',
    label: 'Go to my collaborations',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
    category: 'navigation',
    keywords: ['shared', 'team', 'collaborate'],
  },
  {
    value: '/?nav=trash',
    label: 'Go to my trash',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
    category: 'navigation',
    keywords: ['deleted', 'bin', 'remove'],
  },
  {
    value: '/bookmark',
    label: 'Go to my bookmarks',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
    category: 'navigation',
    keywords: ['starred', 'favorites', 'saved'],
  },
  {
    value: '/recent',
    label: 'Go to my history',
    Icon: <Clock className="mr-2 h-4 w-4" />,
    category: 'navigation',
    keywords: ['recent', 'history', 'past'],
  },
  {
    value: '/?nav=myTeams',
    label: 'Go to my teams',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
    category: 'navigation',
    keywords: ['teams', 'groups', 'workspace'],
  },
  {
    value: '/s/release-notes',
    label: 'Show release notes',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
    category: 'navigation',
    keywords: ['changelog', 'updates', 'news'],
  },
];

const ACTION_COMMANDS: CommandConfig[] = [
  {
    value: 'forward',
    label: 'Go forward',
    Icon: <ArrowRightCircle className="mr-2 h-4 w-4" />,
    category: 'action',
    keywords: ['next', 'forward', 'ahead'],
  },
  {
    value: 'back',
    label: 'Go back',
    Icon: <ArrowLeftCircle className="mr-2 h-4 w-4" />,
    category: 'action',
    keywords: ['previous', 'back', 'return'],
  },
  {
    value: 'reload',
    label: 'Reload',
    Icon: <RefreshCcw className="mr-2 h-4 w-4" />,
    shortcut: '⌘ R',
    category: 'action',
    keywords: ['refresh', 'reload', 'update'],
  },
];

const SETTINGS_COMMANDS: CommandConfig[] = [
  {
    value: '/settings',
    label: 'Open Settings',
    Icon: <Settings className="mr-2 h-4 w-4" />,
    shortcut: '⌘ ,',
    category: 'settings',
    keywords: ['preferences', 'config', 'options'],
  },
];

const ALL_COMMANDS = [
  ...NAVIGATION_COMMANDS,
  ...ACTION_COMMANDS,
  ...SETTINGS_COMMANDS,
];

const RECENT_COMMANDS_KEY = 'hackdesk_recent_commands';
const MAX_RECENT_COMMANDS = 5;

function redirect(path: string) {
  invoke(Cmd.EXECUTE_ACTION, {
    action: {
      type: 'Navigate',
      data: { path },
    },
  });
}

function getRecentCommands(): string[] {
  try {
    const recent = localStorage.getItem(RECENT_COMMANDS_KEY);
    return recent ? JSON.parse(recent) : [];
  } catch {
    return [];
  }
}

function saveRecentCommand(value: string) {
  try {
    const recent = getRecentCommands();
    const filtered = recent.filter((v) => v !== value);
    const updated = [value, ...filtered].slice(0, MAX_RECENT_COMMANDS);
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save recent command:', error);
  }
}

export function CommandPalette() {
  const [search, setSearch] = useState('');
  const { theme, setTheme } = useTheme();
  const [recentValues, setRecentValues] = useState<string[]>([]);

  useEffect(() => {
    setRecentValues(getRecentCommands());
  }, []);

  // Fuzzy search with Fuse.js
  const fuse = useMemo(
    () =>
      new Fuse(ALL_COMMANDS, {
        keys: ['label', 'keywords', 'value'],
        threshold: 0.3,
        includeScore: true,
      }),
    [],
  );

  const searchResults = useMemo(() => {
    if (!search) return ALL_COMMANDS;
    return fuse.search(search).map((result) => result.item);
  }, [search, fuse]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups = {
      recent: [] as CommandConfig[],
      navigation: [] as CommandConfig[],
      action: [] as CommandConfig[],
      settings: [] as CommandConfig[],
    };

    // Add recent commands if no search
    if (!search && recentValues.length > 0) {
      groups.recent = recentValues
        .map((value) => ALL_COMMANDS.find((cmd) => cmd.value === value))
        .filter((cmd): cmd is CommandConfig => cmd !== undefined);
    }

    // Group search results
    searchResults.forEach((cmd) => {
      if (!groups.recent.find((r) => r.value === cmd.value)) {
        groups[cmd.category].push(cmd);
      }
    });

    return groups;
  }, [searchResults, recentValues, search]);

  const handleSelect = (value: string) => {
    const command = ALL_COMMANDS.find((cmd) => cmd.value === value);
    if (!command) return;

    saveRecentCommand(value);

    switch (value) {
    case 'back':
      invoke(Cmd.EXECUTE_ACTION, { action: { type: 'GoBack' } });
      break;
    case 'forward':
      invoke(Cmd.EXECUTE_ACTION, { action: { type: 'GoForward' } });
      break;
    case 'reload':
      invoke(Cmd.EXECUTE_ACTION, { action: { type: 'Reload' } });
      break;
    default:
      redirect(value);
    }

    getCurrentWebviewWindow().hide();
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
    getCurrentWebviewWindow().hide();
  };

  // Handle ESC key to close command palette
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        getCurrentWebviewWindow().hide();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="p-2">
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search commands..."
          value={search}
          onValueChange={setSearch}
          autoFocus
        />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>

          {/* Recent Commands */}
          {groupedCommands.recent.length > 0 && (
            <>
              <CommandGroup heading="Recent">
                {groupedCommands.recent.map((cmd) => (
                  <CommandItem
                    key={cmd.value}
                    value={cmd.value}
                    onSelect={handleSelect}
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

          {/* Navigation */}
          {groupedCommands.navigation.length > 0 && (
            <>
              <CommandGroup heading="Navigation">
                {groupedCommands.navigation.map((cmd) => (
                  <CommandItem
                    key={cmd.value}
                    value={cmd.value}
                    onSelect={handleSelect}
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

          {/* Actions */}
          {groupedCommands.action.length > 0 && (
            <>
              <CommandGroup heading="Actions">
                {groupedCommands.action.map((cmd) => (
                  <CommandItem
                    key={cmd.value}
                    value={cmd.value}
                    onSelect={handleSelect}
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

          {/* Settings */}
          {groupedCommands.settings.length > 0 && (
            <CommandGroup heading="Settings">
              {groupedCommands.settings.map((cmd) => (
                <CommandItem
                  key={cmd.value}
                  value={cmd.value}
                  onSelect={handleSelect}
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
        </CommandList>
      </Command>
    </div>
  );
}
