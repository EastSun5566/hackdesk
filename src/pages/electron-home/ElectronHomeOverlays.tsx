import type { ComponentProps } from 'react';
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

import { CommandPaletteDialog } from './CommandPaletteDialog';
import { ElectronHomeDialogs } from './ElectronHomeDialogs';
import { FOCUS_RING_CLASS, PRESSED_CLASS, SECONDARY_BUTTON_CLASS } from './ui';

export type ElectronHomeOverlaysProps = {
  commandPalette: Omit<ComponentProps<typeof CommandPaletteDialog>, 'onRequestDisconnectHackmd'>;
  dialogs: ComponentProps<typeof ElectronHomeDialogs>;
};

export function ElectronHomeOverlays({
  commandPalette,
  dialogs,
}: ElectronHomeOverlaysProps) {
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const handleConfirmDisconnect = () => {
    dialogs.onDisconnectHackmd();
    setDisconnectDialogOpen(false);
  };

  return (
    <>
      <CommandPaletteDialog
        {...commandPalette}
        onRequestDisconnectHackmd={() => setDisconnectDialogOpen(true)}
      />
      <ElectronHomeDialogs {...dialogs} />
      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect HackMD?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the HackMD API token stored by HackDesk. Your HackMD notes and Local Vault files are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={SECONDARY_BUTTON_CLASS}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisconnect}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md bg-destructive-default px-3 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive-hover',
                PRESSED_CLASS,
                FOCUS_RING_CLASS,
              )}
            >
              <AlertCircle aria-hidden="true" className="h-4 w-4" />
              Disconnect HackMD
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
