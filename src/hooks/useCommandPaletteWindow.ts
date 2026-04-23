import { useEffect } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const COMPACT_COMMAND_PALETTE_SIZE = {
  width: 560,
  height: 312,
} as const;

export const NOTES_COMMAND_PALETTE_SIZE = {
  width: 760,
  height: 560,
} as const;

type CommandPaletteWindowMode = 'compact' | 'notes';

export function useCommandPaletteWindow(mode: CommandPaletteWindowMode) {
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