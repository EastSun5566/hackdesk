import { globalShortcut } from 'electron';

import { toGlobalShortcutAccelerator } from '../../../src/lib/keyboard-shortcuts';
import { DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT } from '../../../src/lib/quick-capture-shortcuts';
import { writeLog } from './logging';
import type { WindowManager } from './window-manager';

type GlobalShortcutApi = Pick<typeof globalShortcut, 'register' | 'unregister'>;

/** The hotkey from Settings, and the accelerator the system holds for it while registered. */
let quickCaptureShortcut = DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT;
let registeredAccelerator: string | null = null;

/**
 * Registers the Quick Hack hotkey from Settings, replacing the one registered before. Applied
 * again with the same keys, it only retries a registration that failed (another app may have
 * let the keys go). `none` turns the hotkey off.
 */
export function registerQuickCaptureGlobalShortcut(
  windowManager: Pick<WindowManager, 'toggleQuickCaptureWindow'>,
  shortcut: string = DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT,
  api: GlobalShortcutApi = globalShortcut,
) {
  if (shortcut === quickCaptureShortcut && registeredAccelerator) return true;

  unregisterQuickCaptureGlobalShortcut(api);
  quickCaptureShortcut = shortcut;
  if (shortcut === 'none') return false;

  const accelerator = toGlobalShortcutAccelerator(shortcut, process.platform);
  let registered = false;
  if (accelerator) {
    try {
      // Pressed again while Quick Hack is in front, the hotkey dismisses it, like Escape.
      registered = api.register(accelerator, () => {
        windowManager.toggleQuickCaptureWindow();
      });
    } catch (error) {
      writeLog('main', 'Quick Hack global shortcut rejected', { accelerator, error }, 'warn');
    }
  }

  if (registered) {
    registeredAccelerator = accelerator!;
  } else {
    writeLog('main', 'failed to register Quick Hack global shortcut', { accelerator: accelerator ?? shortcut }, 'warn');
  }

  return registered;
}

export function unregisterQuickCaptureGlobalShortcut(api: Pick<GlobalShortcutApi, 'unregister'> = globalShortcut) {
  if (registeredAccelerator) api.unregister(registeredAccelerator);
  registeredAccelerator = null;
}

export function getQuickCaptureShortcutStatus() {
  return {
    shortcut: quickCaptureShortcut,
    registered: registeredAccelerator !== null,
  };
}
