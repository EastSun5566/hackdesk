import {
  isReservedShortcutConfig,
  isValidCustomShortcutConfig,
  parseShortcutConfig,
  shortcutConfigsOverlap,
} from './keyboard-shortcuts';

/** Pins or unpins the Quick Hack popup while it is open. */
export const DEFAULT_QUICK_CAPTURE_PIN_SHORTCUT = 'mod+shift+p';

/** The global hotkey that opens and closes Quick Hack; the system takes it before the popup. */
export const QUICK_CAPTURE_TOGGLE_SHORTCUT = 'control+alt+h';

/**
 * Keys the popup already uses: capture, bold, italic, redo (Ctrl+Y off macOS) and the global hotkey.
 * The editor's other bindings may be taken; the pin wins over them, as the person chose it.
 */
const QUICK_CAPTURE_KEPT_SHORTCUTS = ['mod+enter', 'mod+b', 'mod+i', 'mod+y', QUICK_CAPTURE_TOGGLE_SHORTCUT];

export type QuickCapturePinShortcutProblem = 'reserved' | 'modifier' | 'quick-hack';

/** Why a pin shortcut cannot be used, or null when it can. `none` turns the shortcut off. */
export function getQuickCapturePinShortcutProblem(config: string): QuickCapturePinShortcutProblem | null {
  const value = config.trim().toLowerCase();
  if (value === 'none') return null;
  if (!isValidCustomShortcutConfig(value)) return isReservedShortcutConfig(value) ? 'reserved' : 'modifier';

  // Shift alone still types: the popup is a text field, so the pin needs Command, Control or Alt.
  const [shortcut] = parseShortcutConfig(value, 'darwin');
  if (!shortcut || !(shortcut.alt || shortcut.ctrl || shortcut.meta)) return 'modifier';

  const takenByQuickHack = QUICK_CAPTURE_KEPT_SHORTCUTS.some((kept) => (
    ['darwin', 'win32'].some((platform) => shortcutConfigsOverlap(kept, value, platform))
  ));
  return takenByQuickHack ? 'quick-hack' : null;
}

export function isValidQuickCapturePinShortcut(config: string) {
  return getQuickCapturePinShortcutProblem(config) === null;
}
