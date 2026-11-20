import {
  isReservedShortcutConfig,
  isValidCustomShortcutConfig,
  parseShortcutConfig,
  recordShortcutFromEvent,
  shortcutConfigsOverlap,
  type ShortcutPlatform,
} from './keyboard-shortcuts';

/** Pins or unpins the Quick Hack popup while it is open. */
export const DEFAULT_QUICK_CAPTURE_PIN_SHORTCUT = 'mod+shift+p';

/** The global hotkey that opens and closes Quick Hack from any app. */
export const DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT = 'control+alt+h';

/**
 * Keys the popup's editor uses: capture, bold, italic and redo (Ctrl+Y off macOS). Its other
 * bindings may be taken; the pin wins over them, as the person chose it.
 */
const QUICK_CAPTURE_EDITOR_SHORTCUTS = ['mod+enter', 'mod+b', 'mod+i', 'mod+y'];

/** Keys a global hotkey can name on every platform: letters, digits, F-keys, Space, arrows, punctuation. */
const GLOBAL_SHORTCUT_KEY = /^(?:[a-z0-9]|f(?:[1-9]|1\d|2[0-4])|space|arrow(?:up|down|left|right)|comma|minus|plus|[.;'/\\[\]=`])$/;

/**
 * Why a Quick Hack shortcut cannot be used: reserved by the editor or system, missing Command,
 * Control or Alt, a key a global hotkey cannot name, taken by the popup's editor, or taken by
 * the other Quick Hack shortcut.
 */
export type QuickCaptureShortcutProblem = 'reserved' | 'modifier' | 'key' | 'quick-hack' | 'other';

function getShortcutProblem(config: string, otherShortcut: string | undefined): QuickCaptureShortcutProblem | null {
  const value = config.trim().toLowerCase();
  if (value === 'none') return null;
  if (!isValidCustomShortcutConfig(value)) return isReservedShortcutConfig(value) ? 'reserved' : 'modifier';

  // Shift alone still types, so both shortcuts need Command, Control or Alt.
  const [shortcut] = parseShortcutConfig(value, 'darwin');
  if (!shortcut || !(shortcut.alt || shortcut.ctrl || shortcut.meta)) return 'modifier';

  const overlaps = (kept: string) => ['darwin', 'win32'].some((platform) => shortcutConfigsOverlap(kept, value, platform));
  if (QUICK_CAPTURE_EDITOR_SHORTCUTS.some(overlaps)) return 'quick-hack';
  return otherShortcut && overlaps(otherShortcut) ? 'other' : null;
}

/**
 * Why a pin shortcut cannot be used, or null when it can. `none` turns it off. Given the global
 * hotkey, a pin on the same keys is refused too: the system would take them first.
 */
export function getQuickCapturePinShortcutProblem(config: string, toggleShortcut?: string) {
  return getShortcutProblem(config, toggleShortcut);
}

export function isValidQuickCapturePinShortcut(config: string) {
  return getQuickCapturePinShortcutProblem(config) === null;
}

/** Why a global Quick Hack hotkey cannot be used, or null when it can. `none` turns it off. */
export function getQuickCaptureToggleShortcutProblem(config: string, pinShortcut?: string) {
  const problem = getShortcutProblem(config, pinShortcut);
  if (problem) return problem;
  const [shortcut] = parseShortcutConfig(config.trim().toLowerCase(), 'darwin');
  return !shortcut || GLOBAL_SHORTCUT_KEY.test(shortcut.key) ? null : 'key';
}

export function isValidQuickCaptureToggleShortcut(config: string) {
  return getQuickCaptureToggleShortcutProblem(config) === null;
}

/**
 * Records a global hotkey by the physical key where the character would mislead: Shift turns a
 * digit into a symbol (Shift+9 types `(`), and on macOS Option changes letters too (Option+H
 * types ˙). The hotkey belongs to the key.
 */
export function recordGlobalShortcutFromEvent(event: KeyboardEvent, platform: ShortcutPlatform) {
  const recorded = recordShortcutFromEvent(event, platform);
  if (!recorded) return recorded;
  const digit = /^Digit(\d)$/.exec(event.code)?.[1];
  const letter = event.altKey ? /^Key([A-Z])$/.exec(event.code)?.[1] : undefined;
  const physicalKey = digit ?? letter;
  if (!physicalKey) return recorded;
  const parts = recorded.split('+');
  parts[parts.length - 1] = physicalKey.toLowerCase();
  return parts.join('+');
}
