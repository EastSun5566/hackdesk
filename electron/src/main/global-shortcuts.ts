import { globalShortcut } from 'electron';

import { writeLog } from './logging';
import type { WindowManager } from './window-manager';

export const QUICK_CAPTURE_GLOBAL_SHORTCUT = 'Control+Alt+H' as const;

let quickCaptureShortcutRegistered = false;

export function registerQuickCaptureGlobalShortcut(
  windowManager: WindowManager,
  shortcut = globalShortcut,
) {
  quickCaptureShortcutRegistered = shortcut.register(QUICK_CAPTURE_GLOBAL_SHORTCUT, () => {
    windowManager.showQuickCaptureWindow();
  });

  if (!quickCaptureShortcutRegistered) {
    writeLog(
      'main',
      'failed to register quick capture global shortcut',
      { accelerator: QUICK_CAPTURE_GLOBAL_SHORTCUT },
      'warn',
    );
  }

  return quickCaptureShortcutRegistered;
}

export function unregisterQuickCaptureGlobalShortcut(shortcut = globalShortcut) {
  shortcut.unregister(QUICK_CAPTURE_GLOBAL_SHORTCUT);
  quickCaptureShortcutRegistered = false;
}

export function getQuickCaptureShortcutStatus() {
  return {
    accelerator: QUICK_CAPTURE_GLOBAL_SHORTCUT,
    registered: quickCaptureShortcutRegistered,
  };
}
