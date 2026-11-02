import type { ElectronActionId } from './electron-api';

export type ElectronMenuSchemaItem =
  | { type: 'action'; actionId: ElectronActionId }
  | { type: 'role'; role: string }
  | { type: 'link'; label: string; url: string }
  | { type: 'separator' };

export type ElectronMenuSchemaSection = {
  id: string;
  label: string;
  macOnly?: boolean;
  items: ElectronMenuSchemaItem[];
};

export const ELECTRON_MENU_SCHEMA: ElectronMenuSchemaSection[] = [
  {
    id: 'app',
    label: 'HackDesk',
    macOnly: true,
    items: [
      { type: 'role', role: 'about' },
      { type: 'separator' },
      { type: 'action', actionId: 'open-settings' },
      { type: 'separator' },
      { type: 'role', role: 'hide' },
      { type: 'role', role: 'hideOthers' },
      { type: 'role', role: 'unhide' },
      { type: 'separator' },
      { type: 'role', role: 'quit' },
    ],
  },
  {
    id: 'file',
    label: 'File',
    items: [
      { type: 'action', actionId: 'new-tab' },
      { type: 'action', actionId: 'new-note' },
      { type: 'action', actionId: 'new-note-from-template' },
      { type: 'action', actionId: 'new-folder' },
      { type: 'action', actionId: 'import-markdown-note' },
      { type: 'separator' },
      { type: 'action', actionId: 'save-note' },
      { type: 'action', actionId: 'attach-image' },
      { type: 'action', actionId: 'export-note-markdown' },
      { type: 'separator' },
      { type: 'action', actionId: 'rename-note' },
      { type: 'action', actionId: 'duplicate-note' },
      { type: 'action', actionId: 'move-note-to-folder' },
      { type: 'action', actionId: 'reveal-note-in-finder' },
      { type: 'action', actionId: 'copy-note-link' },
      { type: 'action', actionId: 'copy-markdown-link' },
      { type: 'action', actionId: 'share-note' },
      { type: 'separator' },
      { type: 'action', actionId: 'open-note-web-editor' },
      { type: 'action', actionId: 'show-note-versions' },
      { type: 'action', actionId: 'delete-note' },
      { type: 'separator' },
      { type: 'action', actionId: 'close-tab' },
      { type: 'action', actionId: 'close-other-tabs' },
      { type: 'action', actionId: 'close-tabs-to-right' },
      { type: 'action', actionId: 'reopen-last-closed-tab' },
      { type: 'separator' },
      { type: 'role', role: 'platform-close' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { type: 'role', role: 'undo' },
      { type: 'role', role: 'redo' },
      { type: 'separator' },
      { type: 'role', role: 'cut' },
      { type: 'role', role: 'copy' },
      { type: 'role', role: 'paste' },
      { type: 'role', role: 'selectAll' },
      { type: 'separator' },
      { type: 'action', actionId: 'find-in-note' },
      { type: 'action', actionId: 'ai-assist' },
      { type: 'action', actionId: 'ask-notes' },
      { type: 'action', actionId: 'dictate' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { type: 'action', actionId: 'open-command-palette' },
      { type: 'action', actionId: 'open-quick-open' },
      { type: 'action', actionId: 'toggle-theme' },
      { type: 'action', actionId: 'search-notes' },
      { type: 'action', actionId: 'refresh' },
      { type: 'action', actionId: 'go-history' },
      { type: 'action', actionId: 'show-trash' },
      { type: 'action', actionId: 'navigate-back' },
      { type: 'action', actionId: 'navigate-forward' },
      { type: 'separator' },
      { type: 'action', actionId: 'toggle-navigator' },
      { type: 'action', actionId: 'toggle-hack-mode' },
      { type: 'action', actionId: 'toggle-inspector' },
      { type: 'action', actionId: 'toggle-key-hints' },
      { type: 'separator' },
      { type: 'action', actionId: 'present-note' },
      { type: 'action', actionId: 'toggle-book-contents' },
      { type: 'action', actionId: 'close-book' },
      { type: 'separator' },
      { type: 'action', actionId: 'split-pane-right' },
      { type: 'action', actionId: 'split-pane-down' },
      { type: 'action', actionId: 'toggle-pane-zoom' },
      { type: 'action', actionId: 'equalize-panes' },
      { type: 'action', actionId: 'move-tab-to-other-pane' },
      { type: 'action', actionId: 'move-tab-left' },
      { type: 'action', actionId: 'move-tab-right' },
      { type: 'action', actionId: 'focus-next-tab' },
      { type: 'action', actionId: 'focus-previous-tab' },
      { type: 'action', actionId: 'focus-next-pane' },
      { type: 'action', actionId: 'focus-previous-pane' },
      { type: 'separator' },
      { type: 'action', actionId: 'focus-workspace' },
      { type: 'action', actionId: 'focus-navigator' },
      { type: 'action', actionId: 'focus-editor' },
      { type: 'action', actionId: 'focus-inspector' },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { type: 'action', actionId: 'show-keyboard-shortcuts' },
      { type: 'action', actionId: 'open-leader-menu' },
      { type: 'action', actionId: 'export-debug-logs' },
      { type: 'separator' },
      { type: 'link', label: 'HackDesk Documentation', url: 'https://hackdesk.eastsun.me' },
      { type: 'link', label: 'HackMD API', url: 'https://api.hackmd.io/v1/docs/swagger.json' },
    ],
  },
];
