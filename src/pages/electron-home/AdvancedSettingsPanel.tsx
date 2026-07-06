import { useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
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

import { getHackDeskAPI } from '@/lib/electron-api';
import { cn } from '@/lib/utils';
import { version } from '../../../package.json';

import { SettingsSection } from './SettingsPrimitives';
import { FOCUS_RING_CLASS, PRESSED_CLASS, SECONDARY_BUTTON_CLASS } from './ui';

export function AdvancedSettingsPanel({
  onResetAllSettings,
}: {
  onResetAllSettings: () => void;
}) {
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const resetButtonRef = useRef<HTMLButtonElement>(null);

  const handleCheckForUpdates = () => {
    const api = getHackDeskAPI();
    if (!api?.app.checkForUpdates) {
      toast.error('Update checks are available only in the packaged Electron app.');
      return;
    }

    setIsCheckingUpdates(true);
    api.app.checkForUpdates()
      .then((result) => {
        switch (result.status) {
        case 'upToDate':
          toast.info('You’re already on the latest version of HackDesk.');
          break;
        case 'declined':
          toast.info(`Skipped installing HackDesk v${result.version}.`);
          break;
        case 'installed':
          toast.success(
            result.restart_required ? 'Update ready.' : 'Update installed.',
            {
              description: result.restart_required
                ? `HackDesk v${result.version} is ready. Quit and reopen the app to finish applying the update.`
                : `HackDesk v${result.version} installed successfully.`,
            },
          );
          break;
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to check for updates.');
      })
      .finally(() => setIsCheckingUpdates(false));
  };

  const handleResetDialogOpenChange = (open: boolean) => {
    setIsResetDialogOpen(open);
    if (!open) {
      window.requestAnimationFrame(() => resetButtonRef.current?.focus());
    }
  };

  const handleConfirmReset = () => {
    onResetAllSettings();
    handleResetDialogOpenChange(false);
  };

  return (
    <div className="space-y-4">
      <SettingsSection title="Version">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-background-default px-3 py-2">
          <span className="text-sm text-text-subtle">HackDesk v{version}</span>
          <Button
            variant="secondary"
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdates}
          >
            {isCheckingUpdates ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
            {isCheckingUpdates ? 'Checking…' : 'Check for Updates'}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Reset">
        <div className="rounded-md border border-destructive-default/40 bg-background-default p-3">
          <p className="mb-3 text-xs leading-5 text-text-subtle">
            Restores local preferences and clears the configured HackMD token. Notes and vault files are not deleted.
          </p>
          <Button
            ref={resetButtonRef}
            variant="destructive"
            onClick={() => setIsResetDialogOpen(true)}
          >
            <AlertCircle className="h-4 w-4" />
            Reset All Settings
          </Button>
        </div>
      </SettingsSection>

      <AlertDialog open={isResetDialogOpen} onOpenChange={handleResetDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores local preferences, editor mode, appearance, and clears the configured HackMD token.
              Local vault Markdown files are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={SECONDARY_BUTTON_CLASS}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReset}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md bg-destructive-default px-3 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive-hover',
                PRESSED_CLASS,
                FOCUS_RING_CLASS,
              )}
            >
              <AlertCircle className="h-4 w-4" />
              Reset All Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
