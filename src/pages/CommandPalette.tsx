import { useEffect } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import {
  Cross,
  ArrowRight,
  ArrowRightCircle,
  ArrowLeftCircle,
  RefreshCcw,
  Settings,
  Sun,
  Moon,
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
}

const DEFAULT_COMMANDS: CommandConfig[] = [
  {
    value: '/new',
    label: 'New Note',
    Icon: <Cross className="mr-2 h-4 w-4" />,
    shortcut: '⌘ N',
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

const commandPaletteWindow = getCurrentWebviewWindow();

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    commandPaletteWindow.close();
  }
};

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

  commandPaletteWindow.close();
};

export function CommandPalette() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Command className="rounded-lg shadow-md" loop>
      <CommandInput 
        placeholder="Type a command or search..."
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />
      
      <CommandList className='max-h-[267px] overflow-y-auto'>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
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
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Appearance">
          <CommandItem
            value="theme:Toggle theme"
            onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' 
              ? <Sun className="mr-2 h-4 w-4" /> 
              : <Moon className="mr-2 h-4 w-4" />}
            <span>{
              theme === 'dark' 
                ? 'Light theme' 
                : 'Dark theme'
            }</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
