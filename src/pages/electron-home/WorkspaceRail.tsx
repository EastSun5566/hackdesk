import { Folder, History, Lock, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { TeamSummary } from '@/lib/electron-api';

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
  return (
    <EntityRow
      selected={active}
      icon={icon}
      title={collapsed ? '' : label}
      trailing={collapsed ? null : trailing}
      variant="compact"
      onClick={onClick}
      ariaLabel={label}
      titleAttribute={collapsed ? label : undefined}
      className={collapsed ? 'justify-center px-2' : undefined}
      contentClassName={collapsed ? 'hidden' : undefined}
    />
  );
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
  onOpenSettings,
}: {
  id: string;
  scope: WorkspaceScope;
  user?: { name: string; username: string };
  teams: TeamSummary[];
  collapsed: boolean;
  width: number;
  onScopeChange: (scope: WorkspaceScope) => void;
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
      className="border-r border-border-default bg-background-default pt-5"
    >
      <div className={`px-3 pb-4 ${collapsed ? 'text-center' : ''}`}>
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
        <div className="mt-4 px-4 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          Teams
        </div>
      ) : null}
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-4">
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
