import type { ElectronActionId } from './electron-api';
import {
  displayShortcutConfig,
  getShortcutConflicts,
  resolveActionShortcut,
  type ShortcutOverrides,
} from './keyboard-shortcuts';
import type { EditorMode } from './settings';

export type ElectronActionCategory = 'create' | 'navigation' | 'view' | 'note' | 'folder' | 'app';
export type ElectronActionScope = 'global' | 'workspace' | 'navigator' | 'editor' | 'inspector';

export type ElectronActionContext = {
  editorMode: EditorMode;
  hasToken: boolean;
  canCreate: boolean;
  scopeType: 'local' | 'personal' | 'team' | 'history';
  selectedFolderId: string | null;
  canModifySelectedFolder: boolean;
  selectedNoteId: string | null;
  activeTabIsDraft: boolean;
  noteDirty: boolean;
  isSavingNote: boolean;
  openTabCount: number;
  activePaneTabCount: number;
  activePaneTabsToLeftCount: number;
  activePaneTabsToRightCount: number;
  navigationBackCount: number;
  navigationForwardCount: number;
  recentlyClosedTabCount: number;
  paneCount: number;
  inspectorCollapsed: boolean;
  navigatorCollapsed: boolean;
  bookOpen: boolean;
  bookContentsHidden: boolean;
  hasLocalVault: boolean;
  keyHintsVisible: boolean;
  /** Hack Mode leaves only the note, centered in the window. */
  hackMode?: boolean;
};

export type ElectronActionWhen = (context: ElectronActionContext) => boolean;

export type ElectronActionDefinition = {
  id: ElectronActionId;
  label: string;
  description: string;
  keywords: string[];
  category: ElectronActionCategory;
  scope?: ElectronActionScope;
  keyboardContext?: 'character' | 'region' | 'scroll';
  /**
   * The renderer owns this shortcut and the native menu only shows it, so a focused editor can use
   * the same keys first (⌘K asks AI about a selection and opens the palette otherwise).
   */
  rendererShortcut?: boolean;
  defaultKeybinding?: string;
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
  if (context.scopeType !== 'local' && !context.hasToken) {
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

function requireHackmdNote(context: ElectronActionContext) {
  if (!context.selectedNoteId) return 'Select a note first.';
  if (context.scopeType === 'local') return 'Version history is only available for HackMD notes.';
  return requireHackmd(context);
}

function requireLocalNote(context: ElectronActionContext) {
  if (!context.selectedNoteId) return 'Select a note first.';
  return context.scopeType === 'local' ? null : 'Only Local Vault notes are files on this computer.';
}

function requireMovableNote(context: ElectronActionContext) {
  return requireSelectedNote(context) ?? requireWritableWorkspace(context);
}

function requireBook(context: ElectronActionContext) {
  return context.bookOpen ? null : 'Open a book first.';
}

function requireLocalVault(context: ElectronActionContext) {
  return context.hasLocalVault ? null : 'Open a local folder first.';
}

function requireTabsToLeft(context: ElectronActionContext) {
  return requireOpenTab(context) ?? (context.activePaneTabsToLeftCount > 0 ? null : 'No tabs to the left in this pane.');
}

function requireOpenTab(context: ElectronActionContext) {
  return context.openTabCount > 0 ? null : 'Open a note tab first.';
}

// A draft has no title of its own yet: saving it names it from its first line.
function requireSavedTab(context: ElectronActionContext) {
  return requireOpenTab(context) ?? (context.selectedNoteId ? null : 'Save the draft first; its first line becomes the title.');
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

function requireNavigationBack(context: ElectronActionContext) {
  return context.navigationBackCount > 0 ? null : 'No previous note location.';
}

function requireNavigationForward(context: ElectronActionContext) {
  return context.navigationForwardCount > 0 ? null : 'No next note location.';
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
    id: 'show-keyboard-shortcuts',
    label: 'Keyboard Shortcuts',
    description: 'Search keyboard shortcuts for the current region or all actions.',
    keywords: ['keyboard', 'navigation'],
    category: 'app',
    scope: 'global',
    defaultKeybinding: '?',
    keyboardContext: 'character',
  },
  {
    id: 'open-leader-menu',
    label: 'Leader Menu',
    description: 'Run a command with a few letters, such as N then N for a new note. Space also opens it outside text editing.',
    keywords: ['leader', 'which key', 'commands', 'keys', 'space'],
    category: 'app',
    scope: 'global',
    defaultKeybinding: 'mod+j',
  },
  {
    id: 'focus-next-region',
    label: 'Next Workbench Region',
    description: 'Focus the next visible Workbench region.',
    keywords: ['keyboard', 'navigation'],
    category: 'navigation',
    scope: 'global',
    defaultKeybinding: 'f6',
    keyboardContext: 'region',
  },
  {
    id: 'focus-previous-region',
    label: 'Previous Workbench Region',
    description: 'Focus the previous visible Workbench region.',
    keywords: ['keyboard', 'navigation'],
    category: 'navigation',
    scope: 'global',
    defaultKeybinding: 'shift+f6',
    keyboardContext: 'region',
  },
  {
    id: 'scroll-half-page-up',
    label: 'Scroll Half Page Up',
    description: 'Scroll the focused UI region up; text editors keep their own keys.',
    keywords: ['keyboard', 'navigation'],
    category: 'navigation',
    scope: 'global',
    defaultKeybinding: 'ctrl+u',
    keyboardContext: 'scroll',
  },
  {
    id: 'scroll-half-page-down',
    label: 'Scroll Half Page Down',
    description: 'Scroll the focused UI region down; text editors keep their own keys.',
    keywords: ['keyboard', 'navigation'],
    category: 'navigation',
    scope: 'global',
    defaultKeybinding: 'ctrl+d',
    keyboardContext: 'scroll',
  },

  {
    id: 'new-tab',
    label: 'New Tab',
    description: 'Open another note tab in the active pane.',
    keywords: ['tab', 'open'],
    category: 'create',
    scope: 'editor',
    defaultKeybinding: 'mod+t',
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
    defaultKeybinding: 'mod+n',
    shortcut: '⌘N',
    menuAccelerator: 'Command+N',
    getDisabledReason: requireWritableWorkspace,
  },
  {
    id: 'new-folder',
    label: 'New Folder',
    description: 'Create a folder in the current workspace or selected folder.',
    keywords: ['create', 'directory'],
    category: 'create',
    scope: 'navigator',
    defaultKeybinding: 'mod+shift+n',
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
    defaultKeybinding: 'mod+s',
    shortcut: '⌘S',
    menuAccelerator: 'CmdOrCtrl+S',
    getDisabledReason: (context) => {
      const noteReason = requireSelectedNote(context);
      if (noteReason && !context.activeTabIsDraft) {
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
    defaultKeybinding: 'mod+f',
    shortcut: '⌘F',
    menuAccelerator: 'CmdOrCtrl+F',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'ai-assist',
    label: 'Ask AI...',
    description: 'Fix, rewrite, translate or ask AI about the selection, or the whole note when nothing is selected. With a selection, ⌘K does the same.',
    keywords: ['ai', 'assist', 'summarize', 'rewrite', 'continue', 'translate', 'codex', 'claude'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireOpenTab,
  },
  {
    id: 'ask-notes',
    label: 'Ask Your Notes...',
    description: 'Ask AI a question answered from this workspace\'s notes, with links to the notes it used.',
    keywords: ['ai', 'ask', 'question', 'answer', 'chat', 'search', 'notes', 'codex', 'claude'],
    category: 'navigation',
    scope: 'workspace',
  },
  {
    id: 'dictate',
    label: 'Start Dictation',
    description: 'Dictate at the cursor. Press again or Enter to insert the text; Escape cancels. Speech is recognized on this Mac.',
    keywords: ['dictation', 'dictate', 'voice', 'speech', 'microphone', 'transcribe'],
    category: 'note',
    scope: 'editor',
    defaultKeybinding: 'mod+shift+d',
    shortcut: '⇧⌘D',
    menuAccelerator: 'CmdOrCtrl+Shift+D',
    // A toggle must run once per press: on Windows and Linux a native accelerator would fire too.
    rendererShortcut: true,
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'attach-image',
    label: 'Attach Image...',
    description: 'Insert an image attachment at the current cursor.',
    keywords: ['image', 'attachment', 'upload', 'insert', 'paste'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'export-note-markdown',
    label: 'Export Note as Markdown',
    description: 'Export the selected note draft to a local Markdown file.',
    keywords: ['download', 'markdown', 'file'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'import-markdown-note',
    label: 'Import Markdown Note',
    description: 'Create a HackMD note from a local Markdown file.',
    keywords: ['upload', 'markdown', 'file'],
    category: 'create',
    scope: 'navigator',
    defaultKeybinding: 'mod+o',
    shortcut: '⌘O',
    menuAccelerator: 'CmdOrCtrl+O',
    getDisabledReason: requireWritableWorkspace,
  },
  {
    id: 'open-note-web-editor',
    label: 'Open Note in HackMD',
    description: 'Open the selected note in HackMD.',
    keywords: ['hackmd', 'browser', 'edit'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'show-note-versions',
    label: 'Show Version History',
    description: 'Browse saved HackMD versions of the selected note.',
    keywords: ['history', 'versions', 'revisions', 'restore', 'diff', 'compare'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireHackmdNote,
  },
  {
    id: 'new-note-from-template',
    label: 'New Note from Template…',
    description: 'Start a note from one in the workspace\'s Templates folder.',
    keywords: ['template', 'create', 'new', 'note', 'boilerplate'],
    category: 'note',
    scope: 'navigator',
    getDisabledReason: requireWritableWorkspace,
  },
  {
    id: 'save-as-template',
    label: 'Save as Template',
    description: 'Copy the selected note into the workspace\'s Templates folder.',
    keywords: ['template', 'save', 'copy', 'reuse'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: (context) => requireSelectedNote(context) ?? requireWritableWorkspace(context),
  },
  {
    id: 'open-as-book',
    label: 'Open as Book',
    description: 'Show the selected note\'s links as a book with chapters.',
    keywords: ['book', 'contents', 'chapters', 'toc', 'read'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'present-note',
    label: 'Present',
    description: 'Show the selected note as full-screen slides, split at --- lines.',
    keywords: ['slide', 'slides', 'present', 'presentation', 'deck', 'reveal'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'rename-note',
    label: 'Rename Note',
    description: 'Edit the title of the note in the active pane.',
    keywords: ['title', 'rename', 'name'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSavedTab,
  },
  {
    id: 'duplicate-note',
    label: 'Duplicate Note',
    description: 'Make a copy of the selected note in the same folder.',
    keywords: ['copy', 'clone', 'duplicate'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireMovableNote,
  },
  {
    id: 'move-note-to-folder',
    label: 'Move Note to Folder…',
    description: 'Choose a folder for the selected note.',
    keywords: ['move', 'folder', 'organize', 'file'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireMovableNote,
  },
  {
    id: 'reveal-note-in-finder',
    label: 'Reveal Note in Finder',
    description: 'Show the selected Local Vault note in the file manager.',
    keywords: ['finder', 'explorer', 'file', 'folder', 'show', 'local'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireLocalNote,
  },
  {
    id: 'copy-note-link',
    label: 'Copy Note Link',
    description: 'Copy the link to the selected note.',
    keywords: ['copy', 'link', 'url', 'hackmd'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'copy-markdown-link',
    label: 'Copy Markdown Link',
    description: 'Copy a Markdown link to the selected note.',
    keywords: ['copy', 'markdown', 'link', 'reference'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'share-note',
    label: 'Share Note…',
    description: 'Change who can read and edit the selected HackMD note.',
    keywords: ['share', 'access', 'permission', 'publish'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: (context) => {
      if (!context.selectedNoteId) return 'Select a note first.';
      return context.scopeType === 'local' ? 'Sharing is only available for HackMD notes.' : requireHackmd(context);
    },
  },
  {
    id: 'toggle-book-contents',
    label: 'Toggle Book Contents',
    description: 'Show or hide the contents of the open book.',
    keywords: ['book', 'contents', 'chapters', 'toc', 'sidebar'],
    category: 'view',
    scope: 'editor',
    getLabel: (context) => (context.bookContentsHidden ? 'Show Book Contents' : 'Hide Book Contents'),
    getDisabledReason: requireBook,
  },
  {
    id: 'close-book',
    label: 'Close Book',
    description: 'Close the open book; its chapters stay open in tabs.',
    keywords: ['book', 'close', 'contents'],
    category: 'view',
    scope: 'editor',
    getDisabledReason: requireBook,
  },
  {
    id: 'previous-chapter',
    label: 'Previous Chapter',
    description: 'Open the previous chapter of the open book.',
    keywords: ['book', 'chapter', 'back', 'previous'],
    category: 'note',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'next-chapter',
    label: 'Next Chapter',
    description: 'Open the next chapter of the open book.',
    keywords: ['book', 'chapter', 'forward', 'next'],
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
    defaultKeybinding: 'mod+w',
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
    defaultKeybinding: 'mod+shift+t',
    shortcut: '⇧⌘T',
    menuAccelerator: 'Shift+CmdOrCtrl+T',
    getDisabledReason: requireRecentlyClosedTab,
  },
  {
    id: 'move-tab-left',
    label: 'Move Tab Left',
    description: 'Move the active tab one place to the left.',
    keywords: ['reorder', 'tab', 'left'],
    category: 'view',
    scope: 'workspace',
    getDisabledReason: requireTabsToLeft,
  },
  {
    id: 'move-tab-right',
    label: 'Move Tab Right',
    description: 'Move the active tab one place to the right.',
    keywords: ['reorder', 'tab', 'right'],
    category: 'view',
    scope: 'workspace',
    getDisabledReason: requireTabsToRight,
  },
  {
    id: 'split-pane-right',
    label: 'Split Pane Right',
    description: 'Move the active note tab into a second editor pane.',
    keywords: ['pane', 'split', 'layout'],
    category: 'view',
    scope: 'editor',
    defaultKeybinding: 'mod+\\',
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
    defaultKeybinding: 'mod+alt+arrowright,ctrl+tab',
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
    defaultKeybinding: 'mod+alt+arrowleft,ctrl+shift+tab',
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
    getDisabledReason: (context) => context.paneCount > 1 ? null : 'Split the editor before switching panes.',
  },
  {
    id: 'focus-previous-pane',
    label: 'Previous Pane',
    description: 'Focus the previous editor pane.',
    keywords: ['pane', 'previous'],
    category: 'navigation',
    scope: 'editor',
    getDisabledReason: (context) => context.paneCount > 1 ? null : 'Split the editor before switching panes.',
  },
  {
    id: 'open-settings',
    label: 'Open Settings',
    description: 'Manage the HackDesk title, appearance, and HackMD API token.',
    keywords: ['preferences', 'token', 'appearance', 'theme'],
    category: 'app',
    scope: 'global',
    defaultKeybinding: 'mod+comma',
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
    id: 'set-editor-mode-standard',
    label: 'Use Standard Editor Mode',
    description: 'Use the default CodeMirror keyboard shortcuts.',
    keywords: ['editor', 'mode', 'keybindings', 'standard', 'default'],
    category: 'app',
    scope: 'global',
    getDisabledReason: (context) => context.editorMode === 'standard' ? 'Standard editor mode is already active.' : null,
  },
  {
    id: 'set-editor-mode-emacs',
    label: 'Use Emacs Editor Mode',
    description: 'Use Emacs navigation, mark, kill-ring, and key chords.',
    keywords: ['editor', 'mode', 'keybindings', 'emacs', 'control'],
    category: 'app',
    scope: 'global',
    getDisabledReason: (context) => context.editorMode === 'emacs' ? 'Emacs editor mode is already active.' : null,
  },
  {
    id: 'set-editor-mode-vim',
    label: 'Use Vim Editor Mode',
    description: 'Use Vim motions, operators, and command mode.',
    keywords: ['editor', 'mode', 'keybindings', 'vim', 'modal'],
    category: 'app',
    scope: 'global',
    getDisabledReason: (context) => context.editorMode === 'vim' ? 'Vim editor mode is already active.' : null,
  },
  {
    id: 'set-editor-mode-helix',
    label: 'Use Helix Editor Mode',
    description: 'Use selection-first Helix editing and command mode.',
    keywords: ['editor', 'mode', 'keybindings', 'helix', 'modal'],
    category: 'app',
    scope: 'global',
    getDisabledReason: (context) => context.editorMode === 'helix' ? 'Helix editor mode is already active.' : null,
  },
  {
    id: 'set-editor-mode-kakoune',
    label: 'Use Kakoune Editor Mode',
    description: 'Use experimental selection-first Kakoune editing.',
    keywords: ['editor', 'mode', 'keybindings', 'kakoune', 'modal', 'experimental'],
    category: 'app',
    scope: 'global',
    getDisabledReason: (context) => context.editorMode === 'kakoune' ? 'Kakoune editor mode is already active.' : null,
  },
  {
    id: 'open-command-palette',
    label: 'Command Palette',
    description: 'Search and run HackDesk commands.',
    keywords: ['commands', 'search'],
    category: 'navigation',
    scope: 'global',
    defaultKeybinding: 'mod+k,mod+shift+p',
    shortcut: '⌘K',
    menuAccelerator: 'CmdOrCtrl+K',
    rendererShortcut: true,
  },
  {
    id: 'open-quick-open',
    label: 'Quick Open',
    description: 'Search notes, folders, and workspaces.',
    keywords: ['notes', 'folders', 'files', 'workspaces', 'search', 'open'],
    category: 'navigation',
    scope: 'global',
    defaultKeybinding: 'mod+p',
    shortcut: '⌘P',
    menuAccelerator: 'CmdOrCtrl+P',
  },
  {
    id: 'toggle-navigator',
    label: 'Toggle Sidebar',
    description: 'Hide or show the sidebar with your workspaces, folders and notes.',
    keywords: ['sidebar', 'navigator', 'folders', 'notes', 'view'],
    category: 'view',
    scope: 'navigator',
    defaultKeybinding: 'mod+b',
    shortcut: '⌘B',
    menuAccelerator: 'CmdOrCtrl+B',
  },
  {
    id: 'toggle-hack-mode',
    label: 'Toggle Hack Mode',
    description: 'Leave only the note, centered in the window, without the sidebar, tabs, header or key hints.',
    keywords: ['hack mode', 'focus', 'zen', 'distraction free', 'writing', 'hide'],
    category: 'view',
    scope: 'global',
    defaultKeybinding: 'mod+.',
    shortcut: '⌘.',
    menuAccelerator: 'CmdOrCtrl+.',
    getLabel: (context) => (context.hackMode ? 'Leave Hack Mode' : 'Enter Hack Mode'),
  },
  {
    id: 'toggle-inspector',
    label: 'Toggle Note Details',
    description: 'Collapse or expand note details.',
    keywords: ['metadata', 'details', 'right panel'],
    category: 'view',
    scope: 'inspector',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'toggle-key-hints',
    label: 'Toggle Key Hints',
    description: 'Show or hide the keys for where you are, at the bottom of the window.',
    keywords: ['keys', 'hints', 'shortcuts', 'status', 'bar', 'help'],
    category: 'view',
    scope: 'global',
    getLabel: (context) => (context.keyHintsVisible ? 'Hide Key Hints' : 'Show Key Hints'),
  },
  {
    id: 'refresh',
    label: 'Refresh Notes',
    description: 'Reload notes, folders, teams, and profile data from HackMD.',
    keywords: ['sync', 'reload'],
    category: 'navigation',
    scope: 'global',
    defaultKeybinding: 'mod+shift+r',
    shortcut: '⇧⌘R',
    menuAccelerator: 'Shift+CmdOrCtrl+R',
    getDisabledReason: requireHackmd,
  },
  {
    id: 'search-notes',
    label: 'Focus Note Finder',
    description: 'Focus workspace note search.',
    keywords: ['search', 'filter', 'find', 'workspace', 'notes'],
    category: 'navigation',
    scope: 'navigator',
    defaultKeybinding: '/',
    shortcut: '/',
    keyboardContext: 'character',
  },
  {
    id: 'show-view-options',
    label: 'Show View Options',
    description: 'Choose where note search looks, how notes sort, and filter by permission or tag.',
    keywords: ['sort', 'filter', 'tags', 'scope', 'permissions', 'view'],
    category: 'navigation',
    scope: 'navigator',
  },
  {
    id: 'navigate-back',
    label: 'Back',
    description: 'Go back to the previous note tab location.',
    keywords: ['back', 'previous', 'navigation'],
    category: 'navigation',
    scope: 'editor',
    defaultKeybinding: 'mod+[',
    shortcut: '⌘[',
    menuAccelerator: 'CmdOrCtrl+[',
    getDisabledReason: requireNavigationBack,
  },
  {
    id: 'navigate-forward',
    label: 'Forward',
    description: 'Go forward to the next note tab location.',
    keywords: ['forward', 'next', 'navigation'],
    category: 'navigation',
    scope: 'editor',
    defaultKeybinding: 'mod+]',
    shortcut: '⌘]',
    menuAccelerator: 'CmdOrCtrl+]',
    getDisabledReason: requireNavigationForward,
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
    id: 'show-trash',
    label: 'Show Trash',
    description: 'Restore personal notes deleted from HackMD.',
    keywords: ['deleted', 'restore', 'recover', 'bin', 'undelete'],
    category: 'navigation',
    scope: 'workspace',
    getDisabledReason: requireHackmd,
  },
  {
    id: 'change-local-vault',
    label: 'Change Local Vault…',
    description: 'Choose another folder of Markdown files to use as the Local Vault.',
    keywords: ['local', 'vault', 'folder', 'open', 'switch', 'choose'],
    category: 'app',
    scope: 'global',
    getLabel: (context) => (context.hasLocalVault ? 'Change Local Vault…' : 'Open Local Folder…'),
  },
  {
    id: 'reveal-vault-in-finder',
    label: 'Reveal Local Vault in Finder',
    description: 'Show the Local Vault folder in the file manager.',
    keywords: ['local', 'vault', 'folder', 'finder', 'explorer', 'show'],
    category: 'app',
    scope: 'global',
    getDisabledReason: requireLocalVault,
  },
  {
    id: 'clear-offline-copies',
    label: 'Clear Offline Copies…',
    description: 'Remove the HackMD notes kept on this computer for offline reading and search.',
    keywords: ['offline', 'cache', 'clear', 'storage', 'index', 'privacy'],
    category: 'app',
    scope: 'global',
  },
  {
    id: 'export-debug-logs',
    label: 'Export Debug Logs',
    description: 'Export HackDesk logs and local crash reports for debugging.',
    keywords: ['diagnostics', 'logs', 'crash'],
    category: 'app',
    scope: 'global',
    defaultKeybinding: 'mod+shift+l',
    shortcut: '⇧⌘L',
    menuAccelerator: 'Shift+CmdOrCtrl+L',
  },
  {
    id: 'focus-workspace',
    label: 'Switch Workspace…',
    description: 'Open the workspace switcher at the top of the sidebar.',
    keywords: ['workspace', 'team', 'switch', 'local vault', 'history'],
    category: 'navigation',
    scope: 'global',
  },
  {
    id: 'focus-navigator',
    label: 'Focus Sidebar',
    description: 'Move keyboard focus to the folders and notes in the sidebar.',
    keywords: ['folders', 'notes'],
    category: 'navigation',
    scope: 'navigator',
    defaultKeybinding: 'mod+shift+e',
    shortcut: '⇧⌘E',
    menuAccelerator: 'Shift+CmdOrCtrl+E',
  },
  {
    id: 'focus-editor',
    label: 'Focus Editor',
    description: 'Move keyboard focus to the note editor.',
    keywords: ['document', 'edit'],
    category: 'navigation',
    scope: 'editor',
    getDisabledReason: requireSelectedNote,
  },
  {
    id: 'focus-inspector',
    label: 'Focus Note Details',
    description: 'Move keyboard focus to note details.',
    keywords: ['metadata', 'right panel'],
    category: 'navigation',
    scope: 'inspector',
    getDisabledReason: (context) => {
      const noteReason = requireSelectedNote(context);
      if (noteReason) {
        return noteReason;
      }

      return context.inspectorCollapsed ? 'Open Note Details first.' : null;
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

export const DEFAULT_ACTION_KEYBINDINGS = ELECTRON_ACTIONS.reduce((acc, action) => {
  if (action.defaultKeybinding) {
    acc[action.id] = action.defaultKeybinding;
  }
  return acc;
}, {} as Partial<Record<ElectronActionId, string>>);

export function resolveWorkbenchShortcut(actionId: ElectronActionId, shortcuts: ShortcutOverrides | undefined, characterShortcutsEnabled = true) {
  if (!characterShortcutsEnabled && getElectronAction(actionId).keyboardContext === 'character' && shortcuts?.[actionId] === undefined) return 'none';
  const resolved = resolveActionShortcut(actionId, DEFAULT_ACTION_KEYBINDINGS, shortcuts);
  // A default added after someone saved the same keys for another action yields to their choice.
  if (resolved && shortcuts && shortcuts[actionId] === undefined
    && ['darwin', 'win32'].some(platform => getShortcutConflicts(actionId, resolved, shortcuts, {}, platform).length > 0)) return 'none';
  return resolved;
}

export function getResolvedActionShortcut(
  actionId: ElectronActionId,
  shortcuts: ShortcutOverrides | undefined,
  platform: string,
  characterShortcutsEnabled = true,
) {
  const resolved = resolveWorkbenchShortcut(actionId, shortcuts, characterShortcutsEnabled);
  if (resolved === 'none') {
    return undefined;
  }

  return displayShortcutConfig(
    resolved,
    platform,
  ) || undefined;
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
