import {
  getActionDisabledReason,
  getActionLabel,
  getElectronAction,
  getResolvedActionShortcut,
  type ElectronActionContext,
} from './electron-actions';
import type { ElectronActionId } from './electron-api';
import type { ShortcutOverrides } from './keyboard-shortcuts';

type LeaderGroup = { label: string; keys: Record<string, ElectronActionId> };
type LeaderEntry = LeaderGroup | ElectronActionId;

/**
 * The leader menu, letter by letter. Groups take one letter and their actions a second, so
 * Space n n makes a note. Letters echo the action where they can: r rename, x delete, s split.
 */
export const LEADER_KEYS: Record<string, LeaderEntry> = {
  n: {
    label: 'Note',
    keys: {
      n: 'new-note', t: 'new-note-from-template', r: 'rename-note', d: 'duplicate-note', m: 'move-note-to-folder',
      s: 'save-note', l: 'copy-note-link', k: 'copy-markdown-link', h: 'share-note', v: 'show-note-versions',
      e: 'export-note-markdown', b: 'open-as-book', p: 'present-note', x: 'delete-note',
    },
  },
  t: {
    label: 'Tab',
    keys: {
      w: 'close-tab', o: 'close-other-tabs', r: 'close-tabs-to-right', u: 'reopen-last-closed-tab', s: 'split-pane-right',
      m: 'move-tab-to-other-pane', h: 'move-tab-left', l: 'move-tab-right', j: 'focus-next-tab', k: 'focus-previous-tab',
    },
  },
  g: {
    label: 'Go',
    keys: {
      o: 'open-quick-open', s: 'search-notes', h: 'go-history', t: 'show-trash', b: 'navigate-back', f: 'navigate-forward',
      e: 'focus-editor', n: 'focus-navigator', d: 'focus-inspector',
    },
  },
  v: {
    label: 'View',
    keys: {
      s: 'toggle-workspace-rail', n: 'toggle-navigator', d: 'toggle-inspector', t: 'toggle-theme', k: 'toggle-key-hints',
      c: 'toggle-book-contents',
    },
  },
  a: { label: 'AI', keys: { a: 'ai-assist', q: 'ask-notes', d: 'dictate' } },
  f: { label: 'Folder', keys: { n: 'new-folder', r: 'rename-folder', x: 'delete-folder' } },
  k: 'open-command-palette',
  '?': 'show-keyboard-shortcuts',
  ',': 'open-settings',
};

export type LeaderItem = {
  key: string;
  label: string;
  /** Set for an action; a group has none and opens the next level. */
  actionId?: ElectronActionId;
  /** The action's own shortcut, so the menu teaches it too. */
  shortcut?: string;
  disabledReason?: string;
};

export type LeaderLevel = { path: string[]; title: string[]; items: LeaderItem[] };

/** The menu at `path` (letters typed so far), or null when no such level exists. */
export function getLeaderLevel(path: string[], {
  actionContext,
  shortcuts,
  platform,
  characterShortcutsEnabled,
}: {
  actionContext: ElectronActionContext;
  shortcuts: ShortcutOverrides | undefined;
  platform: string;
  characterShortcutsEnabled: boolean;
}): LeaderLevel | null {
  let entries: Record<string, LeaderEntry> = LEADER_KEYS;
  const title = ['Commands'];
  for (const key of path) {
    const entry = entries[key];
    if (!entry || typeof entry === 'string') return null;
    entries = entry.keys;
    title.push(entry.label);
  }
  return {
    path,
    title,
    items: Object.entries(entries).map(([key, entry]): LeaderItem => {
      if (typeof entry !== 'string') return { key, label: entry.label };
      const action = getElectronAction(entry);
      return {
        key,
        label: getActionLabel(action, actionContext),
        actionId: entry,
        shortcut: getResolvedActionShortcut(entry, shortcuts, platform, characterShortcutsEnabled)?.split(', ')[0],
        disabledReason: getActionDisabledReason(action, actionContext) ?? undefined,
      };
    }),
  };
}

/** Every full key sequence and the action it runs, such as ['n', 'n'] → new-note. */
export function leaderSequences(entries: Record<string, LeaderEntry> = LEADER_KEYS, prefix: string[] = []): [string[], ElectronActionId][] {
  return Object.entries(entries).flatMap(([key, entry]) => (typeof entry === 'string'
    ? [[[...prefix, key], entry] as [string[], ElectronActionId]]
    : leaderSequences(entry.keys, [...prefix, key])));
}
