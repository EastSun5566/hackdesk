import { useState, type ReactNode } from 'react';
import { AlertCircle, FolderOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

import type { ElectronSafeSettings } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';

import { SettingsSection } from './SettingsPrimitives';

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
  onChooseLocalVault: () => Promise<void>;
  onForgetLocalVault: () => Promise<void>;
  onOpenLocalVault: () => Promise<void>;
  onRefreshLocalVault: () => Promise<void>;
}) {
  const [busyAction, setBusyAction] = useState<'choose' | 'forget' | 'open' | 'refresh' | null>(null);
  const vaultPath = settings?.localVault.path ?? snapshot?.rootPath ?? null;
  const isConfigured = Boolean(vaultPath);

  const runVaultAction = (action: NonNullable<typeof busyAction>, callback: () => Promise<void>) => {
    setBusyAction(action);
    callback()
      .catch((actionError) => {
        toast.error(actionError instanceof Error ? actionError.message : 'Local vault action failed.');
      })
      .finally(() => setBusyAction(null));
  };

  return (
    <div className="space-y-4">
      <SettingsSection title="Local Vault">
        <div className="rounded-md border border-border-default bg-background-default p-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-text-subtle">Folder</p>
            <p className="break-all font-mono text-sm text-text-default">
              {vaultPath ?? 'No local vault configured'}
            </p>
          </div>
          {error ? (
            <div className="mt-3 flex gap-2 rounded-md border border-destructive-default/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-default">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <VaultStat label="Notes" value={snapshot ? String(snapshot.notes.length) : '—'} />
          <VaultStat label="Folders" value={snapshot ? String(snapshot.folders.length) : '—'} />
          <VaultStat label="Last scanned" value={formatScannedAt(snapshot)} />
        </div>
      </SettingsSection>

      <SettingsSection title="Vault actions">
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
        <p className="text-xs leading-5 text-text-subtle">
          These actions change HackDesk settings only. Markdown files are not deleted.
        </p>
      </SettingsSection>
    </div>
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
    <div className="rounded-md border border-border-default bg-background-default px-3 py-2">
      <p className="text-xs text-text-subtle">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-default">{value}</p>
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
