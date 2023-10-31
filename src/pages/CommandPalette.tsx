// import { useEffect } from 'react';

import { 
// LogicalSize,
// WebviewWindow,
} from '@tauri-apps/api/window';
// import { invoke } from '@tauri-apps/api/tauri';

import {
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  Smile,
  User,
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

export function CommandPalette() {
  // const commandWindow = WebviewWindow.getByLabel('command-palette');
  // const setCommandWindowHeight = (height: number) => {
  //   commandWindow?.setSize(new LogicalSize(560, height));
  // };
  // useEffect(() => {
  //   setCommandWindowHeight(60);
  // }, []);

  return (
    <Command
      className="rounded-lg border shadow-md"
      onKeyDown={async ({ key }) => {
        if (key === 'Escape') {
          // commandWindow?.close();
        }
      }}
    >
      <CommandInput
        placeholder="Type a command or search..."
        autoFocus
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
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
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
