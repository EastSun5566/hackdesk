import {
  getActionDisabledReason,
  getElectronAction,
  getResolvedActionShortcut,
  type ElectronActionContext,
} from './electron-actions';
import type { ElectronActionId } from './electron-api';
import { displayShortcutConfig, type ShortcutOverrides } from './keyboard-shortcuts';

/** Where keyboard focus is: a workbench region, or the note search box inside the navigator. */
export type KeyHintContext = 'workspace' | 'navigator' | 'finder' | 'tabs' | 'editor' | 'inspector';

export type KeyHint = { keys: string; label: string };

/** Keys built into a region's widgets, which have no action of their own. */
export const WIDGET_KEYS = [
  { region: 'tabs', label: 'Move tab focus', keys: '← / → / Home / End', description: 'Move focus without selecting a tab.' },
  { region: 'tabs', label: 'Select focused tab', keys: 'Enter / Space', description: 'Activate the focused tab.' },
  { region: 'navigator', label: 'Move tree focus', keys: '↑ / ↓ / Home / End', description: 'Move focus without opening a note.' },
  { region: 'navigator', label: 'Expand / collapse folder', keys: '→ / ←', description: 'Expand a folder or move to its parent.' },
  { region: 'navigator', label: 'Open focused tree item', keys: 'Enter / Space', description: 'Select a folder or open a note.' },
  { region: 'navigator', label: 'Find by name', keys: 'Type a name', description: 'Focus the next matching tree item.' },
] as const;

type HintSpec = { keys: string; label: string } | { action: ElectronActionId; label: string };

// The few keys most worth knowing in each place, most useful first. Labels stay short for one line.
const HINTS: Record<KeyHintContext, HintSpec[]> = {
  navigator: [
    { keys: '↑ ↓', label: 'Move' },
    { keys: '↵', label: 'Open' },
    { action: 'search-notes', label: 'Search' },
    { action: 'new-note', label: 'New note' },
    { action: 'open-command-palette', label: 'Commands' },
  ],
  finder: [
    { keys: 'Type', label: 'Filter notes' },
    { keys: 'Esc', label: 'Clear, then back to the tree' },
    { action: 'focus-next-region', label: 'Next area' },
  ],
  tabs: [
    { keys: '← →', label: 'Move' },
    { keys: '↵', label: 'Select' },
    { action: 'close-tab', label: 'Close' },
    { action: 'split-pane-right', label: 'Split right' },
  ],
  editor: [
    { action: 'open-command-palette', label: 'Commands' },
    { action: 'open-quick-open', label: 'Open note' },
    { action: 'save-note', label: 'Save' },
    { action: 'find-in-note', label: 'Find' },
  ],
  inspector: [
    { keys: 'Tab', label: 'Next field' },
    { action: 'focus-next-region', label: 'Next area' },
    { action: 'open-command-palette', label: 'Commands' },
  ],
  workspace: [
    { keys: '↑ ↓', label: 'Move' },
    { keys: '↵', label: 'Switch' },
    { keys: 'workspace-numbers', label: 'Jump to workspace' },
    { action: 'open-command-palette', label: 'Commands' },
  ],
};

/**
 * The keys to show for where focus is. Action keys come from the current bindings, so custom
 * shortcuts show up; an action that is unavailable, or has no key, is left out.
 */
export function getKeyHints(context: KeyHintContext, {
  actionContext,
  shortcuts,
  platform,
  characterShortcutsEnabled,
}: {
  actionContext: ElectronActionContext;
  shortcuts: ShortcutOverrides | undefined;
  platform: string;
  characterShortcutsEnabled: boolean;
}): KeyHint[] {
  return HINTS[context].flatMap((spec): KeyHint[] => {
    if (!('action' in spec)) {
      if (spec.keys !== 'workspace-numbers') return [spec];
      return [{ keys: `${displayShortcutConfig('mod+1', platform)}–9`, label: spec.label }];
    }
    // Save matters only when there is something to save.
    if (spec.action === 'save-note' && !actionContext.noteDirty) return [];
    if (getActionDisabledReason(getElectronAction(spec.action), actionContext)) return [];
    const keys = getResolvedActionShortcut(spec.action, shortcuts, platform, characterShortcutsEnabled);
    return keys ? [{ keys: keys.split(', ')[0]!, label: spec.label }] : [];
  });
}
