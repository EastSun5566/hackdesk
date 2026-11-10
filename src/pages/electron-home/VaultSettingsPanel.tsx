import { useId, useState } from 'react';
import { AlertCircle, ArrowLeftRight, Check, FolderOpen, FolderPlus, HardDrive, Layers, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import type { ElectronSafeSettings } from '@/lib/electron-api';
import { getActiveLocalVaultPath, getLocalWorkspaces, type LocalVaultEntry, type LocalWorkspaceEntry } from '@/lib/settings';
import type { LocalVaultSnapshot } from '@/lib/local-vault';

import { SettingsPage, SettingsSection } from './SettingsPrimitives';
import { localVaultFolderName } from './workspace-root-labels';

const LOCAL_VAULT_SCANNED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const ROW_CLASS = 'flex flex-wrap items-center justify-between gap-3';

function formatScannedAt(snapshot?: LocalVaultSnapshot | null) {
  if (!snapshot?.scannedAtMillis) {
    return 'Not scanned yet';
  }

  return LOCAL_VAULT_SCANNED_AT_FORMATTER.format(new Date(snapshot.scannedAtMillis));
}

function folderNames(vaults: LocalVaultEntry[], vaultIds: string[]) {
  return vaultIds
    .map((vaultId) => vaults.find((vault) => vault.id === vaultId))
    .filter((vault): vault is LocalVaultEntry => Boolean(vault))
    .map((vault) => localVaultFolderName(vault.path));
}

/** A small pill naming a folder, so a working set reads at a glance without repeating paths. */
function FolderPill({ name, muted = false }: { name: string; muted?: boolean }) {
  return (
    <span className={cn(
      'inline-flex max-w-40 items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-4',
      muted ? 'bg-background-muted text-text-subtle' : 'bg-background-primary-subtler text-text-default',
    )}>
      <HardDrive aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** The sets a folder belongs to, on the folder's own row. */
function WorkspacePill({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-40 items-center gap-1 rounded-full bg-background-muted px-2 py-0.5 text-xs leading-4 text-text-subtle">
      <Layers aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Edits a named working set; folders themselves stay in the vault list.
 */
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
  const workspaces: LocalWorkspaceEntry[] = getLocalWorkspaces(settings);
  const activeWorkspaceId = settings?.localVault.activeWorkspaceId ?? null;
  const activeVaultId = settings?.localVault.activeVaultId ?? null;
  const activePath = getActiveLocalVaultPath(settings) ?? snapshot?.rootPath ?? null;
  const isConfigured = vaults.length > 0 || Boolean(activePath);
  const activeFolderName = activePath ? localVaultFolderName(activePath) : null;
  const activeWorkspaceName = workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? null;
  const workspaceNamesByVaultId = new Map<string, string[]>();
  for (const workspace of workspaces) {
    for (const vaultId of workspace.vaultIds) {
      workspaceNamesByVaultId.set(vaultId, [...(workspaceNamesByVaultId.get(vaultId) ?? []), workspace.name]);
    }
  }

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
      {isConfigured ? (
        <SettingsSection title="Open folder">
          <div className={ROW_CLASS}>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium leading-5 text-text-default">{activeFolderName}</p>
                {activeWorkspaceName ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background-primary-subtler px-2 py-0.5 text-xs leading-4 text-text-default">
                    <Layers aria-hidden="true" className="size-3" />
                    In {activeWorkspaceName}
                  </span>
                ) : null}
              </div>
              <p className="truncate font-mono text-xs leading-5 text-text-subtle" title={activePath ?? undefined}>{activePath}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <Button variant="secondary" size="sm" disabled={busyAction !== null} onClick={() => runVaultAction('open', onOpenLocalVault)}>
                <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
                Open in Finder
              </Button>
              <Button variant="secondary" size="sm" disabled={busyAction !== null} onClick={() => runVaultAction('refresh', onRefreshLocalVault)}>
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Refresh Vault
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <VaultStat label="Notes" value={snapshot ? String(snapshot.notes.length) : '—'} />
            <VaultStat label="Folders" value={snapshot ? String(snapshot.folders.length) : '—'} />
            <VaultStat label="Last scanned" value={formatScannedAt(snapshot)} />
          </dl>
          {error ? (
            <div className="flex gap-2 rounded border border-state-danger-border bg-state-danger-bg-light px-2.5 py-2 text-sm text-state-danger-text">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Folders"
        description={isConfigured
          ? 'Every folder HackDesk can open. One folder is open at a time; each keeps its own tabs and drafts.'
          : 'Add a Markdown folder to read and write notes locally.'}
      >
        {vaults.length > 0 ? (
          <ul data-settings-flush className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
            {vaults.map((vault) => {
              const active = vault.id === activeVaultId;
              const memberships = workspaceNamesByVaultId.get(vault.id) ?? [];
              return (
                <li key={vault.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 pl-4 pr-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-medium leading-5 text-text-default">{localVaultFolderName(vault.path)}</p>
                      {active ? <ActiveBadge /> : null}
                    </div>
                    <p className="truncate font-mono text-xs leading-5 text-text-subtle" title={vault.path}>{vault.path}</p>
                    {memberships.length > 0 ? (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {memberships.map((name) => <WorkspacePill key={name} name={name} />)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {active ? null : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyAction !== null}
                        onClick={() => runVaultAction(`switch:${vault.id}`, () => onSwitchLocalVault(vault.id))}
                      >
                        {busyAction === `switch:${vault.id}` ? <Spinner /> : <ArrowLeftRight aria-hidden="true" className="h-3.5 w-3.5" />}
                        Switch
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => runVaultAction(`forget:${vault.id}`, () => onForgetLocalVault(vault.id))}
                    >
                      {busyAction === `forget:${vault.id}` ? <Spinner /> : <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
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
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyAction !== null}
            onClick={() => runVaultAction('choose', () => onAddVault().then(() => undefined))}
          >
            {busyAction === 'choose' ? <Spinner /> : <FolderPlus aria-hidden="true" className="h-3.5 w-3.5" />}
            Add Folder
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Workspaces"
        description="A workspace is a named set of folders. Its folders sit under one sidebar root, and you can jump between them without leaving the set."
      >
        {workspaces.length > 0 ? (
          <ul data-settings-flush className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
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
        ) : (
          <p className="text-sm text-text-subtle">
            {vaults.length > 0
              ? 'No workspaces yet. Group a few folders to keep a project in one place.'
              : 'Add a folder first, then group folders into a workspace.'}
          </p>
        )}
        {workspaceActions && vaults.length > 0 ? (
          <div>
            <NewWorkspaceForm
              vaults={vaults}
              busy={busyAction !== null}
              onCreate={(name, vaultIds) => runVaultAction('workspace:create', () => workspaceActions.create(name, vaultIds))}
            />
          </div>
        ) : null}
      </SettingsSection>
    </SettingsPage>
  );
}

function Spinner() {
  return <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />;
}

function ActiveBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background-primary-subtler px-2 py-0.5 text-xs leading-4 text-text-default">
      <Check aria-hidden="true" className="size-3" />
      Open
    </span>
  );
}

/** The create form stays folded away until asked for, so a long workspace list stays readable. */
function NewWorkspaceForm({
  vaults,
  busy,
  onCreate,
}: {
  vaults: LocalVaultEntry[];
  busy: boolean;
  onCreate: (name: string, vaultIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const fieldId = useId();
  const reset = () => {
    setName('');
    setSelected([]);
  };

  if (!open) {
    return (
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        New workspace
      </Button>
    );
  }

  return (
    <div role="group" aria-label="Create a workspace" className="space-y-2 rounded-md border border-border-default p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-emphasize">New workspace</p>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => { reset(); setOpen(false); }}>
          Cancel
        </Button>
      </div>
      <input
        id={`${fieldId}-name`}
        aria-label="Workspace name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Workspace name"
        className="w-full rounded border border-border-default bg-background-default px-2 py-1 text-sm text-text-default"
      />
      <fieldset className="min-w-0">
        <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-text-subtle">Folders</legend>
        <ul className="m-0 list-none space-y-1 p-0">
          {vaults.map((vault) => (
            <li key={vault.id}>
              <label className="flex items-center gap-2 text-sm text-text-default">
                <input
                  type="checkbox"
                  checked={selected.includes(vault.id)}
                  onChange={() => setSelected((current) => (current.includes(vault.id)
                    ? current.filter((candidate) => candidate !== vault.id)
                    : [...current, vault.id]))}
                  aria-label={localVaultFolderName(vault.path)}
                />
                <span className="min-w-0 truncate">{localVaultFolderName(vault.path)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Button
        variant="secondary"
        size="sm"
        aria-label="Create workspace"
        disabled={busy || !name.trim() || selected.length === 0}
        onClick={() => {
          onCreate(name, selected);
          reset();
          setOpen(false);
        }}
      >
        <Layers aria-hidden="true" className="h-3.5 w-3.5" />
        Create
      </Button>
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
  const names = folderNames(vaults, workspace.vaultIds);

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
    <li className="py-2.5 pl-4 pr-2.5">
      <div className={ROW_CLASS}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium leading-5 text-text-default">{workspace.name}</p>
            {active ? <ActiveBadge /> : null}
          </div>
          <p className="mt-1 flex flex-wrap gap-1">
            {names.length > 0
              ? names.map((folderName) => <FolderPill key={folderName} name={folderName} />)
              : <span className="text-xs leading-5 text-text-subtle">No folders</span>}
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
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit workspace ${workspace.name}`}
            disabled={busyAction !== null || !actions}
            onClick={() => {
              setName(workspace.name);
              setSelected(workspace.vaultIds);
              setEditing((current) => !current);
            }}
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete workspace ${workspace.name}`}
            disabled={busyAction !== null || !actions}
            onClick={() => onRun(`workspace:delete:${workspace.id}`, () => actions?.remove(workspace.id) ?? Promise.resolve())}
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2 rounded-md border border-border-default p-3">
          <label htmlFor={`${fieldId}-name`} className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            Name
          </label>
          <input
            id={`${fieldId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded border border-border-default bg-background-default px-2 py-1 text-sm text-text-default"
          />
          <fieldset className="min-w-0">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-text-subtle">Folders</legend>
            <ul className="m-0 list-none space-y-1 p-0">
              {vaults.map((vault) => (
                <li key={vault.id}>
                  <label className="flex items-center gap-2 text-sm text-text-default">
                    <input
                      type="checkbox"
                      checked={selected.includes(vault.id)}
                      onChange={() => setSelected((current) => (current.includes(vault.id)
                        ? current.filter((candidate) => candidate !== vault.id)
                        : [...current, vault.id]))}
                      aria-label={localVaultFolderName(vault.path)}
                    />
                    <span className="min-w-0 truncate">{localVaultFolderName(vault.path)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" aria-label={`Save workspace ${workspace.name}`} disabled={!name.trim() || selected.length === 0} onClick={save}>
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Cancel editing ${workspace.name}`} onClick={() => setEditing(false)}>
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
