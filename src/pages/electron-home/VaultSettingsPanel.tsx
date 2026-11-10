import { useId, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeftRight, FolderOpen, FolderPlus, Layers, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

import type { ElectronSafeSettings } from '@/lib/electron-api';
import { getActiveLocalVaultPath, type LocalVaultEntry, type LocalWorkspaceEntry } from '@/lib/settings';
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

/** Edits a named working set; folders themselves stay in the vault list. */
export type LocalWorkspaceSettingsActions = {
  create: (name: string, vaultIds: string[]) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  activate: (id: string | null) => Promise<void>;
  setVaults: (id: string, vaultIds: string[]) => Promise<void>;
};

export function VaultSettingsPanel({
  error,
  settings,
  snapshot,
  onAddVault,
  onForgetLocalVault,
  onOpenLocalVault,
  onRefreshLocalVault,
  onSwitchLocalVault,
  workspaceActions,
}: {
  error?: string | null;
  settings?: ElectronSafeSettings;
  snapshot?: LocalVaultSnapshot | null;
  onAddVault: () => Promise<void | boolean>;
  onForgetLocalVault: (vaultId?: string) => Promise<void>;
  onOpenLocalVault: () => Promise<void>;
  onRefreshLocalVault: () => Promise<void>;
  onSwitchLocalVault: (vaultId: string) => Promise<void>;
  workspaceActions?: LocalWorkspaceSettingsActions;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const vaults: LocalVaultEntry[] = settings?.localVault.vaults ?? [];
  const workspaces: LocalWorkspaceEntry[] = settings?.localVault.workspaces ?? [];
  const activeWorkspaceId = settings?.localVault.activeWorkspaceId ?? null;
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

      <SettingsSection title="Workspaces">
        <p className="text-sm leading-5 text-text-subtle">
          Group folders into a named workspace. Its folders sit under one sidebar root; opening one scans just that folder.
        </p>
        {workspaces.length > 0 ? (
          <ul className="mt-3 list-none space-y-1.5">
            {workspaces.map((workspace) => (
              <WorkspaceRow
                key={workspace.id}
                workspace={workspace}
                vaults={vaults}
                active={workspace.id === activeWorkspaceId}
                busyAction={busyAction}
                onRun={runVaultAction}
                actions={workspaceActions}
              />
            ))}
          </ul>
        ) : null}
        {workspaceActions && vaults.length > 0 ? (
          <NewWorkspaceForm
            vaults={vaults}
            busy={busyAction !== null}
            onCreate={(name, vaultIds) => runVaultAction('workspace:create', () => workspaceActions.create(name, vaultIds))}
          />
        ) : (
          <p className="mt-3 text-sm text-text-subtle">Add a folder first, then group folders into a workspace.</p>
        )}
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

function folderCheckboxLabel(vault: LocalVaultEntry) {
  return localVaultFolderName(vault.path);
}

function NewWorkspaceForm({
  vaults,
  busy,
  onCreate,
}: {
  vaults: LocalVaultEntry[];
  busy: boolean;
  onCreate: (name: string, vaultIds: string[]) => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const fieldId = useId();
  const activeVaultSelected = selected.length > 0;
  const toggle = (vaultId: string) => {
    setSelected((current) => (current.includes(vaultId)
      ? current.filter((candidate) => candidate !== vaultId)
      : [...current, vaultId]));
  };
  const create = () => {
    onCreate(name, selected);
    setName('');
    setSelected([]);
  };

  return (
    <div role="group" aria-label="Create a workspace" className="mt-3 space-y-2 rounded border border-border-default px-2.5 py-2">
      <label htmlFor={`${fieldId}-name`} className="text-xs font-medium uppercase tracking-wide text-text-subtle">
        New workspace
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`${fieldId}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Workspace name"
          className="min-w-0 flex-1 rounded border border-border-default bg-background-default px-2 py-1 text-sm text-text-default"
        />
        <Button
          variant="secondary"
          size="sm"
          aria-label="Create workspace"
          disabled={busy || !name.trim() || !activeVaultSelected}
          onClick={create}
        >
          <Layers aria-hidden="true" className="h-3.5 w-3.5" />
          Create
        </Button>
      </div>
      <ul className="list-none space-y-1">
        {vaults.map((vault) => (
          <li key={vault.id}>
            <label className="flex items-center gap-2 text-sm text-text-default">
              <input
                type="checkbox"
                checked={selected.includes(vault.id)}
                onChange={() => toggle(vault.id)}
                aria-label={folderCheckboxLabel(vault)}
              />
              <span className="min-w-0 truncate">{folderCheckboxLabel(vault)}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkspaceRow({
  workspace,
  vaults,
  active,
  busyAction,
  onRun,
  actions,
}: {
  workspace: LocalWorkspaceEntry;
  vaults: LocalVaultEntry[];
  active: boolean;
  busyAction: string | null;
  onRun: (action: string, callback: () => Promise<unknown>) => void;
  actions?: LocalWorkspaceSettingsActions;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [selected, setSelected] = useState<string[]>(workspace.vaultIds);
  const fieldId = useId();
  const folders = workspace.vaultIds
    .map((vaultId) => vaults.find((vault) => vault.id === vaultId))
    .filter((vault): vault is LocalVaultEntry => Boolean(vault));

  const save = () => {
    if (!actions || !name.trim() || selected.length === 0) {
      return;
    }
    setEditing(false);
    onRun(`workspace:save:${workspace.id}`, async () => {
      if (name.trim() !== workspace.name) {
        await actions.rename(workspace.id, name);
      }
      if (selected.join() !== workspace.vaultIds.join()) {
        await actions.setVaults(workspace.id, selected);
      }
    });
  };

  return (
    <li className="rounded border border-border-default px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5 text-text-default">{workspace.name}</p>
          <p className="truncate text-xs leading-5 text-text-subtle" title={folders.map((vault) => vault.path).join('\n')}>
            {folders.map(folderCheckboxLabel).join(', ') || 'No folders'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {active ? (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Close workspace ${workspace.name}`}
              disabled={busyAction !== null}
              onClick={() => onRun(`workspace:close:${workspace.id}`, () => actions?.activate(null) ?? Promise.resolve())}
            >
              Close
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Open workspace ${workspace.name}`}
              disabled={busyAction !== null}
              onClick={() => onRun(`workspace:open:${workspace.id}`, () => actions?.activate(workspace.id) ?? Promise.resolve())}
            >
              <Layers aria-hidden="true" className="h-3.5 w-3.5" />
              Open
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Edit workspace ${workspace.name}`}
            disabled={busyAction !== null || !actions}
            onClick={() => {
              setName(workspace.name);
              setSelected(workspace.vaultIds);
              setEditing((current) => !current);
            }}
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Delete workspace ${workspace.name}`}
            disabled={busyAction !== null || !actions}
            onClick={() => onRun(`workspace:delete:${workspace.id}`, () => actions?.remove(workspace.id) ?? Promise.resolve())}
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2 border-t border-border-default pt-2">
          <label htmlFor={`${fieldId}-name`} className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            Name
          </label>
          <input
            id={`${fieldId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded border border-border-default bg-background-default px-2 py-1 text-sm text-text-default"
          />
          <ul className="list-none space-y-1">
            {vaults.map((vault) => (
              <li key={vault.id}>
                <label className="flex items-center gap-2 text-sm text-text-default">
                  <input
                    type="checkbox"
                    checked={selected.includes(vault.id)}
                    onChange={() => setSelected((current) => (current.includes(vault.id)
                      ? current.filter((candidate) => candidate !== vault.id)
                      : [...current, vault.id]))}
                    aria-label={folderCheckboxLabel(vault)}
                  />
                  <span className="min-w-0 truncate">{folderCheckboxLabel(vault)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" aria-label={`Save workspace ${workspace.name}`} disabled={!name.trim() || selected.length === 0} onClick={save}>
              Save
            </Button>
            <Button variant="secondary" size="sm" aria-label={`Cancel editing ${workspace.name}`} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
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
