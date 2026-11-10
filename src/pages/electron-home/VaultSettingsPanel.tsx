import { useState, type ReactNode } from 'react';
import { AlertCircle, FolderOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

import type { ElectronSafeSettings } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';

import { SettingsPage, SettingsSection } from './SettingsPrimitives';

const LOCAL_VAULT_SCANNED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatScannedAt(snapshot?: LocalVaultSnapshot | null) {
  if (!snapshot?.scannedAtMillis) {
    return 'Not scanned yet';
  }

  return LOCAL_VAULT_SCANNED_AT_FORMATTER.format(new Date(snapshot.scannedAtMillis));
}

export function VaultSettingsPanel({
  error,
  settings,
  snapshot,
  onChooseLocalVault,
  onForgetLocalVault,
  onOpenLocalVault,
  onRefreshLocalVault,
}: {
  error?: string | null;
  settings?: ElectronSafeSettings;
  snapshot?: LocalVaultSnapshot | null;
  onChooseLocalVault: () => Promise<void | boolean>;
  onForgetLocalVault: () => Promise<void>;
  onOpenLocalVault: () => Promise<void>;
  onRefreshLocalVault: () => Promise<void>;
}) {
  const [busyAction, setBusyAction] = useState<'choose' | 'forget' | 'open' | 'refresh' | null>(null);
  const vaultPath = settings?.localVault.path ?? snapshot?.rootPath ?? null;
  const isConfigured = Boolean(vaultPath);

  const runVaultAction = (action: NonNullable<typeof busyAction>, callback: () => Promise<unknown>) => {
    setBusyAction(action);
    callback()
      .catch((actionError) => {
        toast.error(actionError instanceof Error ? actionError.message : 'Local vault action failed.');
      })
      .finally(() => setBusyAction(null));
  };

  return (
    <SettingsPage>
      <SettingsSection title="Location">
        <div>
          <p className="break-all font-mono text-sm text-text-default">
            {vaultPath ?? 'No local vault configured'}
          </p>
          {error ? (
            <div className="mt-3 flex gap-2 rounded border border-state-danger-border bg-state-danger-bg-light px-2.5 py-2 text-sm text-state-danger-text">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <VaultStat label="Notes" value={snapshot ? String(snapshot.notes.length) : '—'} />
          <VaultStat label="Folders" value={snapshot ? String(snapshot.folders.length) : '—'} />
          <VaultStat label="Last scanned" value={formatScannedAt(snapshot)} />
        </dl>
      </SettingsSection>

      <SettingsSection title="Actions">
        <div className="flex flex-wrap gap-2">
          <SettingsActionButton
            busy={busyAction === 'open'}
            disabled={!isConfigured}
            icon={<FolderOpen className="h-4 w-4" />}
            onClick={() => runVaultAction('open', onOpenLocalVault)}
          >
            Open in Finder
          </SettingsActionButton>
          <SettingsActionButton
            busy={busyAction === 'refresh'}
            disabled={!isConfigured}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => runVaultAction('refresh', onRefreshLocalVault)}
          >
            Refresh Vault
          </SettingsActionButton>
          <SettingsActionButton
            busy={busyAction === 'choose'}
            icon={<FolderOpen className="h-4 w-4" />}
            onClick={() => runVaultAction('choose', onChooseLocalVault)}
          >
            Change Vault
          </SettingsActionButton>
          <SettingsActionButton
            busy={busyAction === 'forget'}
            destructive
            disabled={!isConfigured}
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => runVaultAction('forget', onForgetLocalVault)}
          >
            Forget Vault
          </SettingsActionButton>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

function VaultStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-5 text-text-subtle">{label}</dt>
      <dd className="truncate font-medium tabular-nums leading-5 text-text-default">{value}</dd>
    </div>
  );
}

function SettingsActionButton({
  busy,
  children,
  destructive = false,
  disabled,
  icon,
  onClick,
}: {
  busy: boolean;
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      variant={destructive ? 'destructive' : 'secondary'}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : icon}
      {children}
    </Button>
  );
}
