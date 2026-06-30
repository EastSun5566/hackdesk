import { AlertCircle, Folder, HardDrive, History, Lock, Settings2 } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import type { TeamSummary, UserSummary } from '@/lib/electron-api';
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
  className,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  className?: string;
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
      className={cn('min-h-10', collapsed ? 'justify-center px-2' : undefined, className)}
      contentClassName={collapsed ? 'hidden' : undefined}
    />
  );

  return collapsed ? <Tooltip content={label} side="right">{row}</Tooltip> : row;
}

type WorkspaceRailUser = Pick<UserSummary, 'name' | 'username' | 'photo'>;

export type WorkspaceRailAccountStatus = {
  activeError: string | null;
  isFetching: boolean;
  isLoading: boolean;
  showingCachedFallback: boolean;
};

function UserAvatar({
  user,
  className,
  testId,
}: {
  user: WorkspaceRailUser;
  className?: string;
  testId?: string;
}) {
  const baseClassName = cn(
    'flex size-6 items-center justify-center overflow-hidden rounded-full bg-background-selected text-[10px] font-semibold uppercase text-text-default outline outline-1 -outline-offset-1 outline-white/10',
    className,
  );

  if (user.photo) {
    return (
      <img
        src={user.photo}
        alt=""
        className={cn(baseClassName, 'object-cover')}
        data-testid={testId}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className={baseClassName} data-testid={testId}>
      {getUserInitials(user)}
    </span>
  );
}

function TeamLogo({ team }: { team: TeamSummary }) {
  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt=""
        className="size-6 rounded-[6px] object-cover outline outline-1 -outline-offset-1 outline-white/10"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className="flex size-6 items-center justify-center rounded-[6px] bg-background-selected text-[10px] font-semibold uppercase text-text-subtle">
      {team.name.trim().slice(0, 1) || 'T'}
    </span>
  );
}

function AccountSettingsButton({
  collapsed,
  accountStatus,
  user,
  onOpenSettings,
}: {
  collapsed: boolean;
  accountStatus?: WorkspaceRailAccountStatus;
  user?: WorkspaceRailUser;
  onOpenSettings: () => void;
}) {
  const displayName = user ? getUserDisplayName(user) : 'Settings';
  const hasAccountAttention = Boolean(accountStatus?.activeError);
  const isLoadingAccount = !user && Boolean(accountStatus?.isLoading || accountStatus?.isFetching);
  const label = user ? `Open settings for ${displayName}` : 'Open settings';
  const actionLabel = hasAccountAttention ? `${label}. HackMD account needs attention` : label;
  const tooltipLabel = hasAccountAttention ? 'HackMD account needs attention' : label;
  const icon = user ? (
    <UserAvatar user={user} testId="workspace-rail-footer-avatar" />
  ) : (
    <Settings2 className="h-4 w-4" />
  );
  const trailing = hasAccountAttention ? (
    <AlertCircle
      aria-hidden="true"
      data-testid="workspace-rail-account-attention"
      className={cn(
        'h-3.5 w-3.5',
        accountStatus?.showingCachedFallback ? 'text-primary-default' : 'text-destructive-default',
      )}
    />
  ) : isLoadingAccount ? (
    <span
      aria-hidden="true"
      data-testid="workspace-rail-account-loading"
      className="block size-1.5 rounded-full bg-text-subtle opacity-70 motion-safe:animate-pulse"
    />
  ) : (
    <Settings2 className="h-3.5 w-3.5" />
  );
  const row = (
    <EntityRow
      icon={icon}
      title={collapsed ? '' : displayName}
      subtitle={collapsed || !user ? undefined : `@${user.username}`}
      trailing={collapsed ? undefined : trailing}
      variant="compact"
      onClick={onOpenSettings}
      ariaLabel={actionLabel}
      className={cn('min-h-12', collapsed && 'justify-center px-2')}
      contentClassName={collapsed ? 'hidden' : undefined}
      trailingClassName="text-text-subtle"
    />
  );

  return collapsed ? <Tooltip content={tooltipLabel} side="right">{row}</Tooltip> : row;
}

export function WorkspaceRail({
  id,
  scope,
  user,
  teams,
  collapsed,
  accountStatus,
  width,
  onScopeChange,
  onChooseLocalVault,
  onOpenSettings,
  localVaultConfigured,
}: {
  id: string;
  scope: WorkspaceScope;
  user?: WorkspaceRailUser;
  teams: TeamSummary[];
  collapsed: boolean;
  accountStatus?: WorkspaceRailAccountStatus;
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
      className="border-r border-border-default bg-background-default pt-3"
    >
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
          icon={user ? (
            <UserAvatar user={user} testId="workspace-rail-personal-avatar" />
          ) : (
            <Folder className="h-4 w-4" />
          )}
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

      {!collapsed && teams.length > 0 ? (
        <div className="mt-4 px-3 text-[11px] font-medium uppercase text-text-subtle">
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
        <AccountSettingsButton
          collapsed={collapsed}
          accountStatus={accountStatus}
          user={user}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </PanelShell>
  );
}

function getUserInitials(user: WorkspaceRailUser) {
  const source = user.name.trim() || user.username.trim();
  if (!source) {
    return 'U';
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  return source.slice(0, 1).toUpperCase();
}

function getUserDisplayName(user: WorkspaceRailUser) {
  return user.name.trim() || user.username.trim() || 'Settings';
}
