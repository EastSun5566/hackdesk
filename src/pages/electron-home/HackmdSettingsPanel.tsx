import { useRef, useState } from 'react';
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

import { SettingsRow, SettingsSecretInput, SettingsSection } from './SettingsPrimitives';
import { FOCUS_RING_CLASS, PRESSED_CLASS, SECONDARY_BUTTON_CLASS } from './ui';

const SETTINGS_TOKEN_ID = 'settings-hackmd-token';
const SETTINGS_TOKEN_STATUS_ID = 'settings-hackmd-token-status';

export type TokenTestState = {
  status: 'idle' | 'testing' | 'success' | 'error';
  message: string;
};

export function HackmdSettingsPanel({
  hasHackmdApiToken,
  token,
  tokenVisible,
  tokenTest,
  isBusy,
  onDisconnect,
  onTokenChange,
  onTokenVisibleChange,
}: {
  hasHackmdApiToken: boolean;
  token: string;
  tokenVisible: boolean;
  tokenTest: TokenTestState;
  isBusy: boolean;
  onDisconnect: () => void;
  onTokenChange: (token: string) => void;
  onTokenVisibleChange: (visible: boolean) => void;
}) {
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const disconnectButtonRef = useRef<HTMLButtonElement>(null);

  const handleDisconnectDialogOpenChange = (open: boolean) => {
    setDisconnectDialogOpen(open);
    if (!open) {
      window.requestAnimationFrame(() => disconnectButtonRef.current?.focus());
    }
  };

  const handleConfirmDisconnect = () => {
    onDisconnect();
    handleDisconnectDialogOpenChange(false);
  };

  return (
    <>
      <SettingsSection title="HackMD">
        {hasHackmdApiToken ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex w-fit items-center rounded-full border border-success-default/30 bg-success-soft px-2 py-1 text-xs font-medium text-success-default">
              Token configured · leave blank to keep it
            </p>
            <button
              ref={disconnectButtonRef}
              type="button"
              disabled={isBusy}
              onClick={() => setDisconnectDialogOpen(true)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md border border-destructive-default px-3 text-sm font-medium text-destructive-default transition-colors hover:bg-destructive-soft disabled:pointer-events-none disabled:opacity-50',
                FOCUS_RING_CLASS,
              )}
            >
              <AlertCircle aria-hidden="true" className="h-4 w-4" />
              Disconnect HackMD
            </button>
          </div>
        ) : null}
        <SettingsRow label="API Token" htmlFor={SETTINGS_TOKEN_ID}>
          <SettingsSecretInput
            id={SETTINGS_TOKEN_ID}
            name="hackmd-api-token"
            visible={tokenVisible}
            onVisibleChange={onTokenVisibleChange}
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder={hasHackmdApiToken ? 'Token configured' : 'Paste token'}
            autoComplete="off"
            aria-describedby={SETTINGS_TOKEN_STATUS_ID}
            aria-invalid={tokenTest.status === 'error'}
          />
        </SettingsRow>
        <p
          id={SETTINGS_TOKEN_STATUS_ID}
          aria-live="polite"
          className={cn(
            'min-h-5 text-xs',
            tokenTest.status === 'error' ? 'text-destructive-default' : 'text-text-subtle',
          )}
        >
          {tokenTest.message}
        </p>
      </SettingsSection>

      <AlertDialog open={disconnectDialogOpen} onOpenChange={handleDisconnectDialogOpenChange}>
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
