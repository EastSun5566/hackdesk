import { useId, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeftRight, Check, FolderOpen, FolderPlus, HardDrive, Layers, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { ElectronSafeSettings } from '@/lib/electron-api';
import { getActiveLocalVaultPath, getLocalWorkspaces, type LocalVaultEntry, type LocalWorkspaceEntry } from '@/lib/settings';
import type { LocalVaultSnapshot } from '@/lib/local-vault';

import { SettingsPage, SettingsSection } from './SettingsPrimitives';
import { localVaultFolderName } from './workspace-root-labels';

const ROW_CLASS = 'flex flex-wrap items-center justify-between gap-3';

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

  const addFolder = () => runVaultAction('choose', () => onAddVault().then(() => undefined));
  const addButton = (
    <Button variant="secondary" size="sm" disabled={busyAction !== null} onClick={addFolder}>
      {busyAction === 'choose' ? <Spinner /> : <FolderPlus aria-hidden="true" className="h-3.5 w-3.5" />}
      Add Folder
    </Button>
  );

  return (
    <SettingsPage>
      {/* Folders come first: they are what a workspace is made of, and adding one is the first step. */}
      <SettingsSection
        title="Folders"
        description={isConfigured ? 'Markdown folders on this computer. Notes stay where they are.' : undefined}
        action={isConfigured ? addButton : undefined}
      >
        {vaults.length > 0 ? (
          <ul data-settings-flush className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
            {vaults.map((vault) => {
              const active = vault.id === activeVaultId;
              const memberships = workspaceNamesByVaultId.get(vault.id) ?? [];
              const noteCount = active && snapshot ? snapshot.notes.length : null;
              return (
                <li key={vault.id} className="flex items-center gap-3 py-2.5 pl-4 pr-2.5">
                  <HardDrive aria-hidden="true" className={cn('size-4 shrink-0', active ? 'text-primary-default' : 'text-icon-subtle')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-medium leading-5 text-text-default">{localVaultFolderName(vault.path)}</p>
                      {active ? <ActiveBadge /> : null}
                      {memberships.map((name) => <WorkspacePill key={name} name={name} />)}
                    </div>
                    <p className="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-text-subtle">
                      <PathText path={vault.path} />
                      {noteCount === null ? null : <span className="shrink-0 tabular-nums">· {noteCount === 1 ? '1 note' : `${noteCount} notes`}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {active ? (
                      <>
                        <IconAction label="Open in Finder" disabled={busyAction !== null} onClick={() => runVaultAction('open', onOpenLocalVault)}>
                          <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction label="Refresh Vault" disabled={busyAction !== null} onClick={() => runVaultAction('refresh', onRefreshLocalVault)}>
                          {busyAction === 'refresh' ? <Spinner /> : <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
                        </IconAction>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mr-1"
                        disabled={busyAction !== null}
                        onClick={() => runVaultAction(`switch:${vault.id}`, () => onSwitchLocalVault(vault.id))}
                      >
                        {busyAction === `switch:${vault.id}` ? <Spinner /> : <ArrowLeftRight aria-hidden="true" className="h-3.5 w-3.5" />}
                        Switch
                      </Button>
                    )}
                    <IconAction
                      label="Forget"
                      tooltip="Forget this folder (files stay on disk)"
                      disabled={busyAction !== null}
                      onClick={() => runVaultAction(`forget:${vault.id}`, () => onForgetLocalVault(vault.id))}
                    >
                      {busyAction === `forget:${vault.id}` ? <Spinner /> : <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
                    </IconAction>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div data-settings-flush className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <HardDrive aria-hidden="true" className="size-6 text-icon-subtle" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-default">No folders added yet.</p>
              <p className="text-xs leading-5 text-text-subtle">Pick a folder of Markdown files to read and write notes on this computer.</p>
            </div>
            <Button variant="primary" size="sm" disabled={busyAction !== null} onClick={addFolder}>
              {busyAction === 'choose' ? <Spinner /> : <FolderPlus aria-hidden="true" className="h-3.5 w-3.5" />}
              Add Folder
            </Button>
          </div>
        )}
        {error ? (
          <div className="flex gap-2 rounded border border-state-danger-border bg-state-danger-bg-light px-2.5 py-2 text-sm text-state-danger-text">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </SettingsSection>

      {/* A workspace needs two folders to be worth having, so it waits until there are two. */}
      {vaults.length > 1 || workspaces.length > 0 ? (
        <SettingsSection
          title="Workspaces"
          description="Open several folders together in the sidebar."
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
          ) : null}
          {workspaceActions ? (
            <div>
              <NewWorkspaceForm
                vaults={vaults}
                busy={busyAction !== null}
                onCreate={(name, vaultIds) => runVaultAction('workspace:create', () => workspaceActions.create(name, vaultIds))}
              />
            </div>
          ) : null}
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

/**
 * A path cut from its start, so the folder's own name and its parents stay in view (…/Projects/Notes);
 * the full path is in its tooltip.
 */
function PathText({ path }: { path: string }) {
  return (
    <span dir="rtl" title={path} className="min-w-0 truncate text-left">
      <bdi>{path}</bdi>
    </span>
  );
}

function IconAction({ label, tooltip, disabled, onClick, children }: { label: string; tooltip?: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip content={tooltip ?? label}>
      <Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
        {children}
      </Button>
    </Tooltip>
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

