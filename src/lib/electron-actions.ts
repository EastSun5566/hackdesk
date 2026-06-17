import type { ElectronActionId } from './electron-api';

export type ElectronActionCategory = 'create' | 'navigation' | 'view' | 'note' | 'folder' | 'app';
export type ElectronActionScope = 'global' | 'workspace' | 'navigator' | 'editor' | 'inspector';

export type ElectronActionContext = {
  hasToken: boolean;
  canCreate: boolean;
  scopeType: 'personal' | 'team' | 'history';
  selectedFolderId: string | null;
  canModifySelectedFolder: boolean;
  selectedNoteId: string | null;
  noteDirty: boolean;
  isSavingNote: boolean;
  inspectorCollapsed: boolean;
  navigatorCollapsed: boolean;
  workspaceRailCollapsed: boolean;
};

export type ElectronActionWhen = (context: ElectronActionContext) => boolean;

export type ElectronActionDefinition = {
  id: ElectronActionId;
  label: string;
  description: string;
  keywords: string[];
  category: ElectronActionCategory;
  scope?: ElectronActionScope;
  shortcut?: string;
  menuAccelerator?: string;
  when?: ElectronActionWhen;
  getDisabledReason?: (context: ElectronActionContext) => string | null;
};

function requireHackmd(context: ElectronActionContext) {
  return context.hasToken ? null : 'Connect HackMD in Settings first.';
}

function requireWritableWorkspace(context: ElectronActionContext) {
  if (!context.hasToken) {
    return 'Connect HackMD in Settings first.';
  }

  if (!context.canCreate || context.scopeType === 'history') {
    return 'Choose My Workspace or a team first.';
  }

  return null;
}

function requireSelectedFolder(context: ElectronActionContext) {
  if (!context.canModifySelectedFolder) {
    return 'Select a folder first.';
  }

  return null;
}

function requireSelectedNote(context: ElectronActionContext) {
  return context.selectedNoteId ? null : 'Select a note first.';
}

export const ELECTRON_ACTIONS: ElectronActionDefinition[] = [
  {
    id: 'new-note',
    label: 'New Note',
    description: 'Create a note in the current workspace or folder.',
    keywords: ['create', 'document'],
    category: 'create',
    scope: 'navigator',
    shortcut: '⌘N',
    menuAccelerator: 'CmdOrCtrl+N',
    getDisabledReason: requireWritableWorkspace,
  },
  {
    id: 'new-folder',
    label: 'New Folder',
    description: 'Create a folder in the current workspace or selected folder.',
    keywords: ['create', 'directory'],
    category: 'create',
    scope: 'navigator',
    shortcut: '⇧⌘N',
    menuAccelerator: 'Shift+CmdOrCtrl+N',
    getDisabledReason: requireWritableWorkspace,
  },
  {
    id: 'rename-folder',
    label: 'Rename Folder',
    description: 'Rename the selected folder.',
    keywords: ['edit', 'directory'],
    category: 'folder',
    scope: 'navigator',
    getDisabledReason: requireSelectedFolder,
  },
  {
    id: 'delete-folder',
    label: 'Delete Folder',
    description: 'Delete the selected folder from HackMD.',
    keywords: ['remove', 'directory'],
    category: 'folder',
    scope: 'navigator',
    getDisabledReason: requireSelectedFolder,
  },
  {
    id: 'save-note',
    label: 'Save Note',
    description: 'Save the current note title and content.',
    keywords: ['write', 'persist'],
    category: 'note',
    scope: 'editor',
    shortcut: '⌘S',
    menuAccelerator: 'CmdOrCtrl+S',
    getDisabledReason: (context) => {
      const noteReason = requireSelectedNote(context);
      if (noteReason) {
        return noteReason;
      }

      if (context.isSavingNote) {
        return 'The note is already saving.';
      }

      return context.noteDirty ? null : 'No unsaved note changes.';
    },
  },
  {
    id: 'open-note-web-editor',
    label: 'Open Note in Web Editor',
    description: 'Open the selected note in HackMD Web Editor.',
    keywords: ['hackmd', 'browser', 'edit'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'delete-note',
    label: 'Delete Note',
    description: 'Delete the selected note from HackMD.',
    keywords: ['remove', 'trash'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'open-settings',
    label: 'Open Settings',
    description: 'Manage the HackDesk title and HackMD API token.',
    keywords: ['preferences', 'token'],
    category: 'app',
    scope: 'global',
    shortcut: '⌘,',
    menuAccelerator: 'CmdOrCtrl+,',
  },
  {
    id: 'open-command-palette',
    label: 'Command Palette',
    description: 'Search and run HackDesk commands.',
    keywords: ['commands', 'search'],
    category: 'navigation',
    scope: 'global',
    shortcut: '⌘K',
    menuAccelerator: 'CmdOrCtrl+K',
  },
  {
    id: 'toggle-workspace-rail',
    label: 'Toggle Workspace Rail',
    description: 'Collapse or expand the workspace rail.',
    keywords: ['sidebar', 'workspace', 'view'],
    category: 'view',
    scope: 'workspace',
  },
  {
    id: 'toggle-navigator',
    label: 'Toggle Navigator',
    description: 'Collapse or expand the note navigator.',
    keywords: ['folders', 'notes', 'sidebar'],
    category: 'view',
    scope: 'navigator',
    shortcut: '⌥B',
  },
  {
    id: 'toggle-inspector',
    label: 'Toggle Inspector',
    description: 'Collapse or expand the note inspector.',
    keywords: ['metadata', 'right panel'],
    category: 'view',
    scope: 'inspector',
    shortcut: '⌥I',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'refresh',
    label: 'Refresh Notes',
    description: 'Reload notes, folders, teams, and profile data from HackMD.',
    keywords: ['sync', 'reload'],
    category: 'navigation',
    scope: 'global',
    shortcut: '⇧⌘R',
    menuAccelerator: 'Shift+CmdOrCtrl+R',
    getDisabledReason: requireHackmd,
  },
  {
    id: 'go-history',
    label: 'Go to History',
    description: 'Show recently visited HackMD notes from your history.',
    keywords: ['recent', 'activity', 'visited'],
    category: 'navigation',
    scope: 'workspace',
    getDisabledReason: requireHackmd,
  },
  {
    id: 'export-debug-logs',
    label: 'Export Debug Logs',
    description: 'Export HackDesk logs and local crash reports for debugging.',
    keywords: ['diagnostics', 'logs', 'crash'],
    category: 'app',
    scope: 'global',
    shortcut: '⇧⌘L',
    menuAccelerator: 'Shift+CmdOrCtrl+L',
  },
  {
    id: 'focus-workspace',
    label: 'Focus Workspace',
    description: 'Move keyboard focus to the workspace list.',
    keywords: ['sidebar', 'team'],
    category: 'navigation',
    scope: 'workspace',
    shortcut: '⌥1',
  },
  {
    id: 'focus-navigator',
    label: 'Focus Navigator',
    description: 'Move keyboard focus to the note navigator.',
    keywords: ['folders', 'notes'],
    category: 'navigation',
    scope: 'navigator',
    shortcut: '⌥2',
  },
  {
    id: 'focus-editor',
    label: 'Focus Editor',
    description: 'Move keyboard focus to the note editor.',
    keywords: ['document', 'edit'],
    category: 'navigation',
    scope: 'editor',
    shortcut: '⌥3',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'focus-inspector',
    label: 'Focus Inspector',
    description: 'Move keyboard focus to the note inspector.',
    keywords: ['metadata', 'right panel'],
    category: 'navigation',
    scope: 'inspector',
    shortcut: '⌥4',
    getDisabledReason: (context) => {
      const noteReason = requireSelectedNote(context);
      if (noteReason) {
        return noteReason;
      }

      return context.inspectorCollapsed ? 'Open the inspector first.' : null;
    },
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

export function getActionDisabledReason(action: ElectronActionDefinition, context: ElectronActionContext) {
  return action.getDisabledReason?.(context) ?? null;
}

export function isElectronActionEnabled(action: ElectronActionDefinition, context: ElectronActionContext) {
  return !getActionDisabledReason(action, context) && (action.when?.(context) ?? true);
}
