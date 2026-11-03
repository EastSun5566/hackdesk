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

import { CommandPaletteDialog } from './CommandPaletteDialog';
import { ElectronHomeDialogs } from './ElectronHomeDialogs';

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
              Removes the saved token. Your notes and vault files stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisconnect}
              variant="destructive-solid"
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
