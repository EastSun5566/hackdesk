import { useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
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
import { isBetaVersion } from '@/lib/version';
import { version as packageVersion } from '../../../package.json';


import { SettingsActionRow, SettingsPage, SettingsSection, SettingsSwitchRow } from './SettingsPrimitives';
import { setSplitStatusLine, useSplitStatusLine } from './split-status-line-preference';

const RELEASES_URL = 'https://github.com/EastSun5566/hackdesk/releases';

function viewReleases() {
  const api = getHackDeskAPI();
  if (!api?.shell.openExternal) {
    toast.error('GitHub Releases are available only in the desktop app.');
    return;
  }

  void api.shell.openExternal(RELEASES_URL).catch((error) => {
    toast.error(error instanceof Error ? error.message : 'Failed to open GitHub Releases.');
  });
}

export function AdvancedSettingsPanel({
  appVersion = packageVersion,
  onResetAllSettings,
}: {
  appVersion?: string;
  onResetAllSettings: () => void;
}) {
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const splitStatusLine = useSplitStatusLine();
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const isBeta = isBetaVersion(appVersion);

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
          toast.info('HackDesk is up to date.');
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
    <SettingsPage>
      <SettingsSection title="Version">
        <SettingsActionRow
          label={`HackDesk v${appVersion}`}
          description={isBeta ? 'Unsigned beta · Manual updates' : undefined}
          action={isBeta ? (
            <Button variant="secondary" size="sm" onClick={viewReleases}>
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              View Releases
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdates}
            >
              {isCheckingUpdates ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : null}
              {isCheckingUpdates ? 'Checking…' : 'Check for Updates'}
            </Button>
          )}
        />
      </SettingsSection>

      <SettingsSection title="Experimental">
        <SettingsSwitchRow
          id="settings-split-status-line"
          label="Split status line"
          description="Keep sidebar keys under the sidebar and editor status under the editor, instead of swapping the line on focus."
          checked={splitStatusLine}
          onCheckedChange={setSplitStatusLine}
        />
      </SettingsSection>

      <SettingsSection title="Reset">
        <SettingsActionRow
          label="Reset all settings"
          description="Puts every preference back to its default and signs out of HackMD."
          action={(
            <Button
              ref={resetButtonRef}
              variant="destructive"
              size="sm"
              onClick={() => setIsResetDialogOpen(true)}
            >
              <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
              Reset All Settings
            </Button>
          )}
        />
      </SettingsSection>

      <AlertDialog open={isResetDialogOpen} onOpenChange={handleResetDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Settings?</AlertDialogTitle>
            <AlertDialogDescription>
              Resets preferences and disconnects HackMD. Your notes and vault files stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReset}
              variant="destructive-solid"
            >
              <AlertCircle className="h-4 w-4" />
              Reset All Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPage>
  );
}
