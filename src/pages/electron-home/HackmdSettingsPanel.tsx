import { useRef, useState } from 'react';
import { AlertCircle, ArrowLeftRight, Loader2, Trash2 } from 'lucide-react';

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

export type HackmdAccountListItem = {
  id: string;
  label: string;
  hasToken: boolean;
};

type PendingRemoval = { id: string; label: string } | null;

function accountName(account: HackmdAccountListItem) {
  return account.label || 'HackMD account';
}

export function HackmdSettingsPanel({
  accounts,
  activeAccountId,
  hasHackmdApiToken,
  tokenStorageError,
  token,
  tokenVisible,
  tokenTest,
  isBusy,
  onSwitchAccount,
  onRemoveAccount,
  onDisconnect,
  onTokenChange,
  onTokenVisibleChange,
  addingAccount,
  onAddingAccountChange,
}: {
  accounts: HackmdAccountListItem[];
  activeAccountId: string | null;
  hasHackmdApiToken: boolean;
  tokenStorageError?: string | null;
  token: string;
  tokenVisible: boolean;
  tokenTest: TokenTestState;
  isBusy: boolean;
  onSwitchAccount: (id: string) => void;
  onRemoveAccount: (id: string) => void;
  onDisconnect: () => void;
  onTokenChange: (token: string) => void;
  onTokenVisibleChange: (visible: boolean) => void;
  /** The token form connects a new account instead of replacing the active token. */
  addingAccount: boolean;
  onAddingAccountChange: (adding: boolean) => void;
}) {
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PendingRemoval>(null);
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

  const handleConfirmRemove = () => {
    if (removeTarget) {
      onRemoveAccount(removeTarget.id);
    }
    setRemoveTarget(null);
  };

  return (
    <>
      <SettingsSection title={accounts.length > 0 ? 'Accounts' : 'Account'}>
        {tokenStorageError ? <p role="alert" className="text-sm text-destructive-default">{tokenStorageError}</p> : null}
        {accounts.length > 0 ? (
          <ul className="list-none space-y-1.5">
            {accounts.map((account) => {
              const active = account.id === activeAccountId;
              return (
                <li
                  key={account.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded border px-2.5 py-2',
                    active ? 'border-border-primary-subtler bg-background-primary-subtler' : 'border-border-default',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className={cn('size-2 shrink-0 rounded-full', account.hasToken ? 'bg-success-default' : 'bg-warning-default')}
                    />
                    <p className="min-w-0 truncate font-medium leading-5">{accountName(account)}</p>
                    {active ? (
                      <span className="shrink-0 rounded bg-background-muted px-1.5 py-0.5 text-xs leading-4 text-text-subtle">Active</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!active ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => onSwitchAccount(account.id)}
                      >
                        <ArrowLeftRight aria-hidden="true" className="h-3.5 w-3.5" />
                        Switch
                      </Button>
                    ) : null}
                    <Button
                      ref={active ? disconnectButtonRef : undefined}
                      variant={active ? 'destructive' : 'secondary'}
                      size="sm"
                      disabled={isBusy}
                      onClick={() => {
                        if (active) {
                          setDisconnectDialogOpen(true);
                        } else {
                          setRemoveTarget({ id: account.id, label: accountName(account) });
                        }
                      }}
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      {active ? 'Disconnect' : 'Forget'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : hasHackmdApiToken ? (
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
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isBusy || tokenTest.status === 'testing' || !token.trim()}
            >
              {tokenTest.status === 'testing' ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : null}
              {tokenTest.status === 'testing'
                ? 'Testing…'
                : addingAccount
                  ? 'Connect account'
                  : hasHackmdApiToken ? 'Save new token' : 'Connect HackMD'}
            </Button>
            {accounts.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => onAddingAccountChange(!addingAccount)}
              >
                {addingAccount ? 'Replace the active token instead' : 'Connect another account'}
              </Button>
            ) : null}
          </div>
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

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget {removeTarget?.label ?? 'account'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes its saved token. Switching back needs the token again. Your notes stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              variant="destructive-solid"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Forget Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
