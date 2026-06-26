import type { ComponentProps } from 'react';

import { CommandPaletteDialog } from './CommandPaletteDialog';
import { ElectronHomeDialogs } from './ElectronHomeDialogs';

export type ElectronHomeOverlaysProps = {
  commandPalette: ComponentProps<typeof CommandPaletteDialog>;
  dialogs: ComponentProps<typeof ElectronHomeDialogs>;
};

export function ElectronHomeOverlays({
  commandPalette,
  dialogs,
}: ElectronHomeOverlaysProps) {
  return (
    <>
      <CommandPaletteDialog {...commandPalette} />
      <ElectronHomeDialogs {...dialogs} />
    </>
  );
}
