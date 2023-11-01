// import { useState, useEffect } from 'react';

import { 
// LogicalSize,
  WebviewWindow,
} from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';

import {
  Cross,
  Home,
  Users2,
  Trash,
  Bookmark,
  History,
  Settings,
  UserPlus2Icon,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  // CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  // CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

const DEFAULT_COMMANDS = [
  {
    value: '/new',
    label: 'New Note',
    Icon: <Cross className="mr-2 h-4 w-4" />,
    shortcut: '⌘N',
  },
  {
    value: '/',
    label: 'Go home',
    Icon: <Home className="mr-2 h-4 w-4" />,
  },
  {
    value: '/?nav=collab',
    label: 'Go to my collaborations',
    Icon: <UserPlus2Icon className="mr-2 h-4 w-4" />,
  },
  {
    value: '/?nav=trash',
    label: 'Go to my trash',
    Icon: <Trash className="mr-2 h-4 w-4" />,
  },
  {
    value: '/bookmark',
    label: 'Go to my bookmarks',
    Icon: <Bookmark className="mr-2 h-4 w-4" />,
  },
  {
    value: '/recent',
    label: 'Go to my history',
    Icon: <History className="mr-2 h-4 w-4" />,
  },
  {
    value: '/settings',
    label: 'Go to my settings',
    Icon: <Settings className="mr-2 h-4 w-4" />,
  },
  {
    value: '/?nav=myTeams',
    label: 'Go to my teams',
    Icon: <Users2 className="mr-2 h-4 w-4" />,
  },
];

const commandPalletteWindow = WebviewWindow.getByLabel('command-palette');

export function CommandPalette() {
  const handleRedirect = async (path: string) => {
    invoke('redirect_main_window', { path });
    commandPalletteWindow?.close();
  };

  return (
    <Command
      className="rounded-lg border shadow-md"
      onKeyDown={async ({ key }) => {
        if (key === 'Escape') {
          commandPalletteWindow?.close();
        }
      }}
    >
      <CommandInput 
        placeholder="Type a command or search..."
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {
          DEFAULT_COMMANDS.map(({ value, label, Icon, shortcut }) => (
            <CommandItem 
              key={value}
              value={`${value}:${label}`}
              onSelect={(value) => handleRedirect(value.split(':')[0])}
            >
              {Icon}
              <span>{label}</span>
              {shortcut && (<CommandShortcut>{shortcut}</CommandShortcut>)}
            </CommandItem>
          ))
        }

        {/* <CommandGroup heading="Suggestions">
          <CommandItem>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <Smile className="mr-2 h-4 w-4" />
            <span>Search Emoji</span>
          </CommandItem>
          <CommandItem>
            <Calculator className="mr-2 h-4 w-4" />
            <span>Calculator</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Billing</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup> */}
      </CommandList>
    </Command>
  );
}
