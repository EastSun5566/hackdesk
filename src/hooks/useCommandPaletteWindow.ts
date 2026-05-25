import { type RefObject, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const COMMAND_PALETTE_OPEN_EVENT = 'command-palette:open';
export const COMMAND_PALETTE_SYNC_THEME_EVENT = 'command-palette:sync-theme';

export const COMPACT_COMMAND_PALETTE_SIZE = {
  width: 560,
  height: 312,
} as const;

export const NOTES_COMMAND_PALETTE_SIZE = {
  width: 760,
  height: 560,
} as const;

type CommandPaletteWindowMode = 'compact' | 'notes';

function isCommandPaletteContentReady(root: HTMLElement) {
  return Boolean(
    root.querySelector('[cmdk-item]')
    && root.querySelector('[cmdk-input-wrapper] input'),
  );
}

function waitForCommandPaletteContent(root: HTMLElement, timeoutMs = 3000) {
  return new Promise<void>((resolve) => {
    if (isCommandPaletteContentReady(root)) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      observer.disconnect();
      resolve();
    };

    const observer = new MutationObserver(() => {
      if (isCommandPaletteContentReady(root)) {
        finish();
      }
    });

    observer.observe(root, { childList: true, subtree: true, attributes: true });

    window.setTimeout(finish, timeoutMs);
  });
}

async function markCommandPaletteReady(rootRef: RefObject<HTMLElement | null>) {
  const root = rootRef.current;
  if (!root) {
    return;
  }

  await waitForCommandPaletteContent(root);
  await invoke('command_palette_ready');
}

function focusCommandPaletteInput(root: HTMLElement) {
  root.querySelector<HTMLInputElement>('[cmdk-input-wrapper] input')?.focus();
}

export function useCommandPaletteWindow(
  mode: CommandPaletteWindowMode,
  rootRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen(COMMAND_PALETTE_OPEN_EVENT, () => {
      const root = rootRef.current;
      if (!root || disposed) {
        return;
      }

      window.dispatchEvent(new Event(COMMAND_PALETTE_SYNC_THEME_EVENT));
      focusCommandPaletteInput(root);
    }).then(async (cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlisten = cleanup;
      await markCommandPaletteReady(rootRef);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [rootRef]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    const size = mode === 'compact' ? COMPACT_COMMAND_PALETTE_SIZE : NOTES_COMMAND_PALETTE_SIZE;

    void currentWindow
      .setSize(new LogicalSize(size.width, size.height))
      .then(() => currentWindow.center())
      .catch((error) => {
        console.error('Failed to resize command palette window:', error);
      });
  }, [mode]);
}
