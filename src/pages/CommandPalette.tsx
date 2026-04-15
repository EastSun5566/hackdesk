import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import Fuse from 'fuse.js';
import { Moon, Sun } from 'lucide-react';

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
import {
  allCommands,
  findCommand,
  getRecentCommands,
  groupCommands,
  saveRecentCommand,
} from './CommandPalette.config';

function redirect(path: string) {
  invoke(Cmd.EXECUTE_ACTION, {
    action: {
      type: 'Navigate',
      data: { path },
    },
  });
}

export function CommandPalette() {
  const [search, setSearch] = useState('');
  const { theme, setTheme } = useTheme();
  const [recentValues, setRecentValues] = useState<string[]>([]);

  useEffect(() => {
    setRecentValues(getRecentCommands());
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(allCommands, {
        keys: ['label', 'keywords', 'value'],
        threshold: 0.3,
        includeScore: true,
      }),
    [],
  );

  const searchResults = useMemo(() => {
    if (!search) return allCommands;
    return fuse.search(search).map((result) => result.item);
  }, [search, fuse]);

  const groupedCommands = useMemo(
    () => groupCommands(search, searchResults, recentValues),
    [search, searchResults, recentValues],
  );

  const handleSelect = (value: string) => {
    const command = findCommand(value);
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

  const hideWindow = useCallback(() => {
    getCurrentWebviewWindow().hide();
  }, []);

  useEscapeKey(hideWindow);

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
