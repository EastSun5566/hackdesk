import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ElectronSafeSettings, UserSummary } from '@/lib/electron-api';

import { SettingsInput, SettingsRow, SettingsSecretInput, SettingsSection } from './SettingsPrimitives';
import type { SettingsFormInput } from './types';
import { FOCUS_RING_CLASS } from './ui';

export function SettingsDialog({
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

  useEffect(() => {
    setTitle(settings?.title ?? 'HackDesk');
  }, [settings?.title]);

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
            <SettingsRow label="Window Title">
              <SettingsInput
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            title="HackMD"
            description={settings?.hasHackmdApiToken ? 'A token is configured. Paste a new token only when rotating it.' : 'Paste a HackMD API token to sync notes and folders.'}
          >
            <SettingsRow label="API Token">
              <SettingsSecretInput
                visible={tokenVisible}
                onVisibleChange={setTokenVisible}
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setTokenTest({ status: 'idle', message: '' });
                }}
                placeholder={settings?.hasHackmdApiToken ? 'Token configured' : 'Paste token'}
                autoComplete="off"
              />
            </SettingsRow>
            <div className="flex items-center justify-between gap-3">
              <p className={`min-h-5 text-xs ${
                tokenTest.status === 'error' ? 'text-destructive-default' : 'text-text-subtle'
              }`}
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
                className={`inline-flex h-9 items-center gap-2 rounded-md border border-border-default px-3 text-sm text-text-default transition-colors hover:bg-background-selected ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
              >
                {tokenTest.status === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Test Token
              </button>
            </div>
          </SettingsSection>

          <button
            type="submit"
            disabled={isSaving || !title.trim()}
            className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary-default px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover ${FOCUS_RING_CLASS} disabled:pointer-events-none disabled:opacity-50`}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
