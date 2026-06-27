import { Folder, HardDrive, History, Lock, Settings2 } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import type { TeamSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

import { EntityRow, PanelShell } from './interaction-primitives';
import type { WorkspaceScope } from './types';
import { RAIL_COLLAPSED_WIDTH } from './ui-preferences';

function WorkspaceRailButton({
  active,
  collapsed,
  icon,
  label,
  trailing,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  const trailingContent = useMemo(() => (
    trailing && !collapsed ? (
      <span className={active ? '' : 'opacity-0 transition-opacity duration-150 group-hover/entity-row:opacity-100 group-focus-within/entity-row:opacity-100 motion-reduce:transition-none'}>
        {trailing}
      </span>
    ) : null
  ), [active, collapsed, trailing]);
  const row = (
    <EntityRow
      selected={active}
      icon={icon}
      title={collapsed ? '' : label}
      trailing={trailingContent}
      variant="compact"
      onClick={onClick}
      ariaLabel={label}
      className={collapsed ? 'justify-center px-2' : undefined}
      contentClassName={collapsed ? 'hidden' : undefined}
    />
  );

  return collapsed ? <Tooltip content={label} side="right">{row}</Tooltip> : row;
}

function TeamLogo({ team }: { team: TeamSummary }) {
  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt=""
        className="h-5 w-5 rounded-[5px] object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-background-selected text-[10px] font-semibold uppercase text-text-subtle">
      {team.name.trim().slice(0, 1) || 'T'}
    </span>
  );
}

export function WorkspaceRail({
  id,
  scope,
  user,
  teams,
  collapsed,
  width,
  onScopeChange,
  onChooseLocalVault,
  onOpenSettings,
  localVaultConfigured,
}: {
  id: string;
  scope: WorkspaceScope;
  user?: { name: string; username: string };
  teams: TeamSummary[];
  collapsed: boolean;
  localVaultConfigured: boolean;
  width: number;
  onScopeChange: (scope: WorkspaceScope) => void;
  onChooseLocalVault: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <PanelShell
      id={id}
      as="aside"
      focusZone="workspace"
      collapsed={collapsed}
      width={width}
      collapsedWidth={RAIL_COLLAPSED_WIDTH}
      className="border-r border-border-default bg-background-default pt-4"
    >
      <div className={cn('px-3 pb-3', collapsed && 'text-center')}>
        <div className="flex items-center gap-2">
          {!collapsed ? (
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">HackDesk</h1>
              <p className="truncate text-xs text-text-subtle">
                {user ? `${user.name} @${user.username}` : 'Workspace'}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-1 px-2">
        <WorkspaceRailButton
          active={scope.type === 'local'}
          collapsed={collapsed}
          icon={<HardDrive className="h-4 w-4" />}
          label="Local Vault"
          onClick={() => {
            if (localVaultConfigured) {
              onScopeChange({ type: 'local', label: 'Local Vault' });
              return;
            }

            onChooseLocalVault();
          }}
        />
        <WorkspaceRailButton
          active={scope.type === 'personal'}
          collapsed={collapsed}
          icon={<Folder className="h-4 w-4" />}
          label="My Workspace"
          onClick={() => onScopeChange({ type: 'personal', label: 'My Workspace' })}
        />
        <WorkspaceRailButton
          active={scope.type === 'history'}
          collapsed={collapsed}
          icon={<History className="h-4 w-4" />}
          label="History"
          onClick={() => onScopeChange({ type: 'history', label: 'History' })}
        />
      </div>

      {!collapsed ? (
        <div className="mt-3 px-4 text-xs font-semibold uppercase text-text-subtle">
          Teams
        </div>
      ) : null}
      <div className="mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
        {teams.map((team) => (
          <WorkspaceRailButton
            key={team.id}
            active={scope.type === 'team' && scope.teamPath === team.path}
            collapsed={collapsed}
            icon={<TeamLogo team={team} />}
            label={team.name}
            trailing={team.visibility === 'private' ? <Lock className="h-3.5 w-3.5" /> : null}
            onClick={() => onScopeChange({ type: 'team', label: team.name, teamPath: team.path })}
          />
        ))}
      </div>

      <div className="border-t border-border-default p-2">
        <WorkspaceRailButton
          active={false}
          collapsed={collapsed}
          icon={<Settings2 className="h-4 w-4" />}
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </PanelShell>
  );
}
