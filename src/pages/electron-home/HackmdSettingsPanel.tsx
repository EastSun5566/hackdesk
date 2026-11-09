import { useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

const SETTINGS_TOKEN_ID = 'settings-hackmd-token';
const SETTINGS_TOKEN_STATUS_ID = 'settings-hackmd-token-status';

export type TokenTestState = {
  status: 'idle' | 'testing' | 'success' | 'error';
  message: string;
};

export function HackmdSettingsPanel({
  hasHackmdApiToken,
  tokenStorageError,
  token,
  tokenVisible,
  tokenTest,
  isBusy,
  onDisconnect,
  onTokenChange,
  onTokenVisibleChange,
}: {
  hasHackmdApiToken: boolean;
  tokenStorageError?: string | null;
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
      <SettingsSection title="Account">
        {tokenStorageError ? <p role="alert" className="text-sm text-destructive-default">{tokenStorageError}</p> : null}
        {hasHackmdApiToken ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success-default" />
              <p className="font-medium leading-5">Token saved</p>
            </div>
            <Button
              ref={disconnectButtonRef}
              variant="destructive"
              disabled={isBusy}
              onClick={() => setDisconnectDialogOpen(true)}
            >
              <AlertCircle aria-hidden="true" className="h-4 w-4" />
              Disconnect HackMD
            </Button>
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
            placeholder={hasHackmdApiToken ? 'Paste a new token' : 'Paste token'}
            autoComplete="off"
            aria-describedby={SETTINGS_TOKEN_STATUS_ID}
            aria-invalid={tokenTest.status === 'error'}
          />
          <p
            id={SETTINGS_TOKEN_STATUS_ID}
            aria-live="polite"
            className={cn(
              // Empty, it takes back the row's gap, so the row has no blank line under the field.
              'text-xs leading-5 empty:-mt-2',
              tokenTest.status === 'error' ? 'text-destructive-default' : 'text-text-subtle',
            )}
          >
            {tokenTest.message}
          </p>
        </SettingsRow>
      </SettingsSection>

      <AlertDialog open={disconnectDialogOpen} onOpenChange={handleDisconnectDialogOpenChange}>
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
