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
  openTabCount: number;
  activePaneTabCount: number;
  activePaneTabsToRightCount: number;
  recentlyClosedTabCount: number;
  paneCount: number;
  inspectorCollapsed: boolean;
  navigatorCollapsed: boolean;
  workspaceRailCollapsed: boolean;
  readerMode: 'read' | 'edit';
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
  getLabel?: (context: ElectronActionContext) => string;
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

function requireOpenTab(context: ElectronActionContext) {
  return context.openTabCount > 0 ? null : 'Open a note tab first.';
}

function requireOtherTabs(context: ElectronActionContext) {
  const tabReason = requireOpenTab(context);
  if (tabReason) {
    return tabReason;
  }

  return context.activePaneTabCount > 1 ? null : 'Open another tab in this pane first.';
}

function requireTabsToRight(context: ElectronActionContext) {
  const tabReason = requireOpenTab(context);
  if (tabReason) {
    return tabReason;
  }

  return context.activePaneTabsToRightCount > 0 ? null : 'No tabs to the right in this pane.';
}

function requireRecentlyClosedTab(context: ElectronActionContext) {
  return context.recentlyClosedTabCount > 0 ? null : 'No recently closed note tabs.';
}

function requireSplitAvailable(context: ElectronActionContext) {
  const tabReason = requireOpenTab(context);
  if (tabReason) {
    return tabReason;
  }

  return context.paneCount < 2 ? null : 'HackDesk supports two note panes in this version.';
}

function requireOtherPane(context: ElectronActionContext) {
  const tabReason = requireOpenTab(context);
  if (tabReason) {
    return tabReason;
  }

  return context.paneCount > 1 ? null : 'Split the editor before moving tabs between panes.';
}

export const ELECTRON_ACTIONS: ElectronActionDefinition[] = [
  {
    id: 'new-tab',
    label: 'New Tab',
    description: 'Open another note tab in the active pane.',
    keywords: ['tab', 'open'],
    category: 'create',
    scope: 'editor',
    shortcut: '⌘T',
    menuAccelerator: 'CmdOrCtrl+T',
  },
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
    label: 'Edit Folder',
    description: 'Edit the selected folder name, icon, and color.',
    keywords: ['edit', 'rename', 'directory', 'icon', 'color'],
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
    id: 'find-in-note',
    label: 'Find in Note',
    description: 'Search inside the active note.',
    keywords: ['find', 'search', 'current note'],
    category: 'note',
    scope: 'editor',
    shortcut: '⌘F',
    menuAccelerator: 'CmdOrCtrl+F',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'export-note-markdown',
    label: 'Export Note as Markdown',
    description: 'Export the selected note draft to a local Markdown file.',
    keywords: ['download', 'markdown', 'file'],
    category: 'note',
    scope: 'editor',
    menuAccelerator: 'Shift+CmdOrCtrl+E',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'import-markdown-note',
    label: 'Import Markdown Note',
    description: 'Create a HackMD note from a local Markdown file.',
    keywords: ['upload', 'markdown', 'file'],
    category: 'create',
    scope: 'navigator',
    menuAccelerator: 'Shift+CmdOrCtrl+I',
    getDisabledReason: requireWritableWorkspace,
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
    id: 'close-tab',
    label: 'Close Tab',
    description: 'Close the active note tab.',
    keywords: ['tab', 'close'],
    category: 'note',
    scope: 'editor',
    shortcut: '⌘W',
    menuAccelerator: 'CmdOrCtrl+W',
    getDisabledReason: requireOpenTab,
  },
  {
    id: 'close-other-tabs',
    label: 'Close Other Tabs',
    description: 'Close other note tabs in the active pane.',
    keywords: ['tab', 'close', 'others'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireOtherTabs,
  },
  {
    id: 'close-tabs-to-right',
    label: 'Close Tabs to Right',
    description: 'Close note tabs to the right of the active tab in this pane.',
    keywords: ['tab', 'close', 'right'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireTabsToRight,
  },
  {
    id: 'reopen-last-closed-tab',
    label: 'Reopen Last Closed Tab',
    description: 'Reopen the most recently closed note tab.',
    keywords: ['tab', 'restore', 'reopen', 'undo'],
    category: 'note',
    scope: 'editor',
    shortcut: '⇧⌘T',
    menuAccelerator: 'Shift+CmdOrCtrl+T',
    getDisabledReason: requireRecentlyClosedTab,
  },
  {
    id: 'split-pane-right',
    label: 'Split Pane Right',
    description: 'Move the active note tab into a second editor pane.',
    keywords: ['pane', 'split', 'layout'],
    category: 'view',
    scope: 'editor',
    shortcut: '⌘\\',
    menuAccelerator: 'CmdOrCtrl+\\',
    getDisabledReason: requireSplitAvailable,
  },
  {
    id: 'move-tab-to-other-pane',
    label: 'Move Tab to Other Pane',
    description: 'Move the active note tab to the other editor pane.',
    keywords: ['pane', 'move', 'tab'],
    category: 'view',
    scope: 'editor',
    getDisabledReason: requireOtherPane,
  },
  {
    id: 'focus-next-tab',
    label: 'Next Tab',
    description: 'Focus the next note tab in the active pane.',
    keywords: ['tab', 'next'],
    category: 'navigation',
    scope: 'editor',
    shortcut: '⌥⌘→',
    menuAccelerator: 'CmdOrCtrl+Alt+Right',
    getDisabledReason: requireOtherTabs,
  },
  {
    id: 'focus-previous-tab',
    label: 'Previous Tab',
    description: 'Focus the previous note tab in the active pane.',
    keywords: ['tab', 'previous'],
    category: 'navigation',
    scope: 'editor',
    shortcut: '⌥⌘←',
    menuAccelerator: 'CmdOrCtrl+Alt+Left',
    getDisabledReason: requireOtherTabs,
  },
  {
    id: 'focus-next-pane',
    label: 'Next Pane',
    description: 'Focus the next editor pane.',
    keywords: ['pane', 'next'],
    category: 'navigation',
    scope: 'editor',
    shortcut: '⌥]',
    getDisabledReason: (context) => context.paneCount > 1 ? null : 'Split the editor before switching panes.',
  },
  {
    id: 'focus-previous-pane',
    label: 'Previous Pane',
    description: 'Focus the previous editor pane.',
    keywords: ['pane', 'previous'],
    category: 'navigation',
    scope: 'editor',
    shortcut: '⌥[',
    getDisabledReason: (context) => context.paneCount > 1 ? null : 'Split the editor before switching panes.',
  },
  {
    id: 'open-settings',
    label: 'Open Settings',
    description: 'Manage the HackDesk title, appearance, and HackMD API token.',
    keywords: ['preferences', 'token', 'appearance', 'theme'],
    category: 'app',
    scope: 'global',
    shortcut: '⌘,',
    menuAccelerator: 'CmdOrCtrl+,',
  },
  {
    id: 'toggle-theme',
    label: 'Toggle Theme',
    description: 'Switch between light and dark appearance.',
    keywords: ['appearance', 'dark', 'light', 'system'],
    category: 'app',
    scope: 'global',
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
    shortcut: '⌘B',
    menuAccelerator: 'CmdOrCtrl+B',
  },
  {
    id: 'toggle-navigator',
    label: 'Toggle Note Navigator',
    description: 'Collapse or expand the note navigator.',
    keywords: ['folders', 'notes', 'sidebar'],
    category: 'view',
    scope: 'navigator',
    shortcut: '⌥⌘B',
    menuAccelerator: 'CmdOrCtrl+Alt+B',
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
    id: 'toggle-reader-mode',
    label: 'Toggle View Mode',
    description: 'Switch between viewing and editing the selected note.',
    keywords: ['read', 'preview', 'edit', 'markdown'],
    category: 'view',
    scope: 'editor',
    getLabel: (context) => context.readerMode === 'read' ? 'Switch to Edit Mode' : 'Switch to View Mode',
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
    id: 'search-notes',
    label: 'Search Notes',
    description: 'Focus workspace note search.',
    keywords: ['search', 'find', 'workspace', 'notes'],
    category: 'navigation',
    scope: 'navigator',
    shortcut: '⇧⌘F',
    menuAccelerator: 'Shift+CmdOrCtrl+F',
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

export function getElectronActionLabel(actionId: ElectronActionId) {
  return getElectronAction(actionId).label;
}

export function getActionShortcut(actionId: ElectronActionId) {
  return getElectronAction(actionId).shortcut;
}

export function splitShortcutKeys(shortcut: string) {
  const keys: string[] = [];
  let remaining = shortcut;

  while (remaining) {
    const modifier = ['⇧', '⌃', '⌥', '⌘'].find((candidate) => remaining.startsWith(candidate));
    if (modifier) {
      keys.push(modifier);
      remaining = remaining.slice(modifier.length);
      continue;
    }

    keys.push(remaining);
    break;
  }

  return keys;
}

export function getActionShortcutKeys(actionId: ElectronActionId) {
  const shortcut = getActionShortcut(actionId);

  return shortcut ? splitShortcutKeys(shortcut) : [];
}

export function getCommandPaletteActions() {
  return ELECTRON_ACTIONS;
}

export function getActionDisabledReason(action: ElectronActionDefinition, context: ElectronActionContext) {
  return action.getDisabledReason?.(context) ?? null;
}

export function getActionLabel(action: ElectronActionDefinition, context: ElectronActionContext) {
  return action.getLabel?.(context) ?? action.label;
}

export function isElectronActionEnabled(action: ElectronActionDefinition, context: ElectronActionContext) {
  return !getActionDisabledReason(action, context) && (action.when?.(context) ?? true);
}
