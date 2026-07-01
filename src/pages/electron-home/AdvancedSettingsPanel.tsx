import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

import { getHackDeskAPI } from '@/lib/electron-api';
import { cn } from '@/lib/utils';
import { version } from '../../../package.json';

import { SettingsSection } from './SettingsPrimitives';
import { FOCUS_RING_CLASS } from './ui';

export function AdvancedSettingsPanel({
  onResetAllSettings,
}: {
  onResetAllSettings: () => void;
}) {
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

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
            result.restart_required
              ? `HackDesk v${result.version} is ready. Quit and reopen the app to finish applying the update.`
              : `HackDesk v${result.version} installed successfully.`,
          );
          break;
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to check for updates.');
      })
      .finally(() => setIsCheckingUpdates(false));
  };

  return (
    <div className="space-y-4">
      <SettingsSection title="Version" description="Check for Electron app updates.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-background-default px-3 py-2">
          <span className="text-sm text-text-subtle">HackDesk v{version}</span>
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdates}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-md border border-border-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover disabled:pointer-events-none disabled:opacity-50',
              FOCUS_RING_CLASS,
            )}
          >
            {isCheckingUpdates ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isCheckingUpdates ? 'Checking…' : 'Check for Updates'}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Reset" description="Restore local app preferences and clear the configured token.">
        <button
          type="button"
          onClick={onResetAllSettings}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-md border border-destructive-default px-3 text-sm font-medium text-destructive-default transition-colors hover:bg-destructive-soft',
            FOCUS_RING_CLASS,
          )}
        >
          <AlertCircle className="h-4 w-4" />
          Reset All Settings
        </button>
      </SettingsSection>
    </div>
  );
}
