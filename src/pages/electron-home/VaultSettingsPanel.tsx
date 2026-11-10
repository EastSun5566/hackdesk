import { useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeftRight, FolderOpen, FolderPlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

import type { ElectronSafeSettings } from '@/lib/electron-api';
import { getActiveLocalVaultPath, type LocalVaultEntry } from '@/lib/settings';
import type { LocalVaultSnapshot } from '@/lib/local-vault';

import { SettingsPage, SettingsSection } from './SettingsPrimitives';
import { localVaultFolderName } from './workspace-root-labels';

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
  onAddVault,
  onForgetLocalVault,
  onOpenLocalVault,
  onRefreshLocalVault,
  onSwitchLocalVault,
}: {
  error?: string | null;
  settings?: ElectronSafeSettings;
  snapshot?: LocalVaultSnapshot | null;
  onAddVault: () => Promise<void | boolean>;
  onForgetLocalVault: (vaultId?: string) => Promise<void>;
  onOpenLocalVault: () => Promise<void>;
  onRefreshLocalVault: () => Promise<void>;
  onSwitchLocalVault: (vaultId: string) => Promise<void>;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const vaults: LocalVaultEntry[] = settings?.localVault.vaults ?? [];
  const activeVaultId = settings?.localVault.activeVaultId ?? null;
  const activePath = getActiveLocalVaultPath(settings) ?? snapshot?.rootPath ?? null;
  const isConfigured = vaults.length > 0 || Boolean(activePath);

  const runVaultAction = (action: string, callback: () => Promise<unknown>) => {
    setBusyAction(action);
    callback()
      .catch((actionError) => {
        toast.error(actionError instanceof Error ? actionError.message : 'Local vault action failed.');
      })
      .finally(() => setBusyAction(null));
  };

  return (
    <SettingsPage>
      <SettingsSection title="Folders">
        {vaults.length > 0 ? (
          <ul className="list-none space-y-1.5">
            {vaults.map((vault) => {
              const active = vault.id === activeVaultId;
              return (
                <li
                  key={vault.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-border-default px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-5 text-text-default">
                      {localVaultFolderName(vault.path)}
                    </p>
                    <p className="truncate font-mono text-xs leading-5 text-text-subtle" title={vault.path}>
                      {vault.path}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {active ? (
                      <span className="rounded bg-background-muted px-1.5 py-0.5 text-xs leading-4 text-text-subtle">
                        Active
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyAction !== null}
                        onClick={() => runVaultAction(`switch:${vault.id}`, () => onSwitchLocalVault(vault.id))}
                      >
                        {busyAction === `switch:${vault.id}` ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <ArrowLeftRight aria-hidden="true" className="h-3.5 w-3.5" />}
                        Switch
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => runVaultAction(`forget:${vault.id}`, () => onForgetLocalVault(vault.id))}
                    >
                      {busyAction === `forget:${vault.id}` ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
                      Forget
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-text-subtle">No local vault configured</p>
        )}
        {error ? (
          <div className="mt-3 flex gap-2 rounded border border-state-danger-border bg-state-danger-bg-light px-2.5 py-2 text-sm text-state-danger-text">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
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
            icon={<FolderPlus className="h-4 w-4" />}
            onClick={() => runVaultAction('choose', () => onAddVault().then(() => undefined))}
          >
            Add Folder
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
