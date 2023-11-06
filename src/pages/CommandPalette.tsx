import { useEffect } from 'react';
import { WebviewWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { Cmd } from '@/constants';

import {
  Cross,
  ArrowRight,
  ArrowRightCircle,
  ArrowLeftCircle,
  RefreshCcw,
  Settings,
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

interface Command {
  value: string;
  label: string;
  Icon: React.ReactNode;
  shortcut?: string;
}

const DEFAULT_COMMANDS: Command[] = [
  {
    value: '/new',
    label: 'New Note',
    Icon: <Cross className="mr-2 h-4 w-4" />,
    // shortcut: '⌘ N',
  },
  {
    value: '/',
    label: 'Go to my notes',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
  },
  {
    value: '/?nav=collab',
    label: 'Go to my collaborations',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
  },
  {
    value: '/?nav=trash',
    label: 'Go to my trash',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
  },
  {
    value: '/bookmark',
    label: 'Go to my bookmarks',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
  },
  {
    value: '/recent',
    label: 'Go to my history',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
  },
  {
    value: '/settings',
    label: 'Go to my settings',
    Icon: <Settings className="mr-2 h-4 w-4" />,
  },
  {
    value: '/?nav=myTeams',
    label: 'Go to my teams',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
  },
  {
    value: '/s/release-notes',
    label: 'Show release notes',
    Icon: <ArrowRight className="mr-2 h-4 w-4" />,
  },
  {
    value: 'forward',
    label: 'Go forward',
    Icon: <ArrowRightCircle className="mr-2 h-4 w-4" />,
  },
  {
    value: 'back',
    label: 'Go back',
    Icon: <ArrowLeftCircle className="mr-2 h-4 w-4" />,
  },
  {
    value: 'reload',
    label: 'Reload',
    Icon: <RefreshCcw className="mr-2 h-4 w-4" />,
  },
];

function redirect(path: string) {
  invoke(Cmd.RUN_SCRIPT, { script: `window.location.href = '${path}'` });
}

function go(direction: 'forward' | 'back') {
  invoke(Cmd.RUN_SCRIPT, { script: `window.history.${direction}()` });
}

function reload() {
  invoke(Cmd.RUN_SCRIPT, { script: 'window.location.reload()' });
}

const commandPalletteWindow = WebviewWindow.getByLabel('command-palette');

export function CommandPalette() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        commandPalletteWindow?.close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelect = async (value: string) => {
    switch (value) {
    case 'forward':
      go(value);
      break;
    case 'back':
      go(value);
      break;
    case 'reload':
      reload();
      break;
    default:
      redirect(value);
    }

    commandPalletteWindow?.close();
  };

  return (
    <Command className="rounded-lg border shadow-md">
      <CommandInput 
        placeholder="Type a command or search..."
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />
      
      <CommandList className='max-h-[267px] overflow-y-auto'>
        <CommandEmpty>No results found.</CommandEmpty>

        {
          DEFAULT_COMMANDS.map(({ value, label, Icon, shortcut }) => (
            <CommandItem
              key={value}
              value={`${value}:${label}`}
              onSelect={(value) => handleSelect(value.split(':')[0])}
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
