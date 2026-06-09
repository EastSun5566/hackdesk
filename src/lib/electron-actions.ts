import type { ElectronActionId } from './electron-api';

export type ElectronActionDefinition = {
  id: ElectronActionId;
  label: string;
  description: string;
  keywords: string[];
  shortcut?: string;
  menuAccelerator?: string;
};

export const ELECTRON_ACTIONS: ElectronActionDefinition[] = [
  {
    id: 'new-note',
    label: 'New Note',
    description: 'Create a note in the current workspace or folder.',
    keywords: ['create', 'document'],
    shortcut: '⌘N',
    menuAccelerator: 'CmdOrCtrl+N',
  },
  {
    id: 'open-settings',
    label: 'Open Settings',
    description: 'Manage the HackDesk title and HackMD API token.',
    keywords: ['preferences', 'token'],
    shortcut: '⌘,',
    menuAccelerator: 'CmdOrCtrl+,',
  },
  {
    id: 'open-command-palette',
    label: 'Command Palette',
    description: 'Search and run HackDesk commands.',
    keywords: ['commands', 'search'],
    shortcut: '⌘K',
    menuAccelerator: 'CmdOrCtrl+K',
  },
  {
    id: 'refresh',
    label: 'Refresh Notes',
    description: 'Reload notes, folders, teams, and profile data from HackMD.',
    keywords: ['sync', 'reload'],
    shortcut: '⇧⌘R',
    menuAccelerator: 'Shift+CmdOrCtrl+R',
  },
  {
    id: 'focus-workspace',
    label: 'Focus Workspace',
    description: 'Move keyboard focus to the workspace list.',
    keywords: ['sidebar', 'team'],
    shortcut: '⌥1',
  },
  {
    id: 'focus-navigator',
    label: 'Focus Navigator',
    description: 'Move keyboard focus to the note navigator.',
    keywords: ['folders', 'notes'],
    shortcut: '⌥2',
  },
  {
    id: 'focus-editor',
    label: 'Focus Editor',
    description: 'Move keyboard focus to the note editor.',
    keywords: ['document', 'edit'],
    shortcut: '⌥3',
  },
];

export function getElectronAction(actionId: ElectronActionId) {
  const action = ELECTRON_ACTIONS.find((candidate) => candidate.id === actionId);

  if (!action) {
    throw new Error(`Unknown Electron action: ${actionId}`);
  }

  return action;
}

export function getCommandPaletteActions() {
  return ELECTRON_ACTIONS;
}
