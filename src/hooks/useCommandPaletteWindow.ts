import { useEffect, useLayoutEffect, useState } from 'react';
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

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function waitUntilPaintReady() {
  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    // Ignore font readiness errors and continue with the reveal sequence.
  }

  await waitForNextPaint();
}

export function useCommandPaletteWindow(mode: CommandPaletteWindowMode) {
  const [isVisible, setIsVisible] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await waitUntilPaintReady();
        if (cancelled) {
          return;
        }

        setIsVisible(true);
        await waitForNextPaint();
        if (cancelled) {
          return;
        }

        const currentWindow = getCurrentWindow();
        await currentWindow.show();
        if (cancelled) {
          return;
        }

        await currentWindow.setFocus();
      } catch (error) {
        console.error('Failed to show command palette window:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  return { isVisible };
}
