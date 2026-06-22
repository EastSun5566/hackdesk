import { useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ElectronSafeSettings, UserSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { SettingsInput, SettingsRow, SettingsSecretInput, SettingsSection } from './SettingsPrimitives';
import type { SettingsFormInput } from './types';
import { FOCUS_RING_CLASS } from './ui';

const SETTINGS_TITLE_ID = 'settings-title';
const SETTINGS_TOKEN_ID = 'settings-hackmd-token';
const SETTINGS_TOKEN_STATUS_ID = 'settings-hackmd-token-status';

type SettingsDialogProps = {
  open: boolean;
  settings?: ElectronSafeSettings;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: SettingsFormInput) => void;
  onValidateToken: (token: string) => Promise<UserSummary>;
};

export function SettingsDialog(props: SettingsDialogProps) {
  return <SettingsDialogContent key={props.settings?.title ?? 'HackDesk'} {...props} />;
}

function SettingsDialogContent({
  open,
  settings,
  isSaving,
  onOpenChange,
  onSave,
  onValidateToken,
}: {
  open: boolean;
  settings?: ElectronSafeSettings;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: SettingsFormInput) => void;
  onValidateToken: (token: string) => Promise<UserSummary>;
}) {
  const [title, setTitle] = useState(settings?.title ?? 'HackDesk');
  const [token, setToken] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenTest, setTokenTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });

  const normalizedToken = token.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure the local Electron app and HackMD API access.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) {
              onSave({
                title: title.trim(),
                ...(normalizedToken ? { hackmdApiToken: normalizedToken } : {}),
              });
            }
          }}
        >
          <SettingsSection title="App">
            <SettingsRow label="Window Title" htmlFor={SETTINGS_TITLE_ID}>
              <SettingsInput
                id={SETTINGS_TITLE_ID}
                name="window-title"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoComplete="off"
                spellCheck
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            title="HackMD"
            description={settings?.hasHackmdApiToken ? 'A token is configured. Paste a new token only when rotating it.' : 'Paste a HackMD API token to sync notes and folders.'}
          >
            <SettingsRow label="API Token" htmlFor={SETTINGS_TOKEN_ID}>
              <SettingsSecretInput
                id={SETTINGS_TOKEN_ID}
                name="hackmd-api-token"
                visible={tokenVisible}
                onVisibleChange={setTokenVisible}
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setTokenTest({ status: 'idle', message: '' });
                }}
                placeholder={settings?.hasHackmdApiToken ? 'Token configured' : 'Paste token'}
                autoComplete="off"
                aria-describedby={SETTINGS_TOKEN_STATUS_ID}
                aria-invalid={tokenTest.status === 'error'}
              />
            </SettingsRow>
            <div className="flex items-center justify-between gap-3">
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
              <button
                type="button"
                disabled={!normalizedToken || tokenTest.status === 'testing'}
                onClick={() => {
                  setTokenTest({ status: 'testing', message: 'Testing token…' });
                  onValidateToken(normalizedToken)
                    .then((user) => {
                      setTokenTest({
                        status: 'success',
                        message: `Token works for ${user.name} @${user.username}.`,
                      });
                    })
                    .catch((error) => {
                      setTokenTest({
                        status: 'error',
                        message: error instanceof Error ? error.message : 'Failed to validate token.',
                      });
                    });
                }}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md border border-border-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover disabled:pointer-events-none disabled:opacity-50',
                  FOCUS_RING_CLASS,
                )}
              >
                {tokenTest.status === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Test Token
              </button>
            </div>
          </SettingsSection>

          <button
            type="submit"
            disabled={isSaving || !title.trim()}
            className={cn(
              'inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary-default px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50',
              FOCUS_RING_CLASS,
            )}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
