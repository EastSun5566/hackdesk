import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  ChevronDown,
  FolderOpen,
  GripVertical,
  HardDrive,
  History,
  Lock,
  Pin,
  PinOff,
  Settings2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { EntityRow, PanelShell } from './interaction-primitives';
import type { WorkspaceScope } from './types';
import { FOCUS_RING_CLASS } from './ui';
import { RAIL_COLLAPSED_WIDTH } from './ui-preferences';
import {
  getWorkspaceAriaShortcut,
  getWorkspaceNavigationTeams,
  getWorkspaceShortcutLabel,
  pinWorkspaceTeam,
  reorderPinnedWorkspaceTeams,
  unpinWorkspaceTeam,
} from './workspace-navigation';
import { PersonalWorkspaceIcon, TeamWorkspaceIcon } from './WorkspaceIcon';

function WorkspaceRailButton({
  accessibleLabel,
  active,
  ariaKeyShortcuts,
  collapsed,
  icon,
  label,
  shortcutLabel,
  showShortcutHint,
  tooltipLabel,
  trailing,
  className,
  onClick,
}: {
  accessibleLabel?: string;
  active: boolean;
  ariaKeyShortcuts?: string;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  shortcutLabel?: string;
  showShortcutHint?: boolean;
  tooltipLabel?: string;
  trailing?: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  const shortcutHint = showShortcutHint && shortcutLabel ? (
    <span
      aria-hidden="true"
      className="min-w-5 rounded bg-background-muted px-1 py-0.5 text-center text-[10px] font-medium text-text-subtle"
    >
      {shortcutLabel.replace(/^⌘|^Ctrl\+/, '')}
    </span>
  ) : null;
  const row = (
    <EntityRow
      selected={active}
      icon={icon}
      title={collapsed ? '' : label}
      trailing={shortcutHint ?? (collapsed ? undefined : trailing)}
      variant="compact"
      onClick={onClick}
      ariaLabel={accessibleLabel ?? label}
      ariaCurrent={active ? 'page' : undefined}
      ariaKeyShortcuts={ariaKeyShortcuts}
      className={cn('min-h-10 flex-1', collapsed ? 'justify-center px-2' : undefined, className)}
      contentClassName={collapsed ? 'hidden' : undefined}
      trailingClassName="opacity-70"
    />
  );
  const tooltip = [tooltipLabel ?? accessibleLabel ?? label, shortcutLabel].filter(Boolean).join(' · ');

  return collapsed ? <Tooltip content={tooltip} side="right">{row}</Tooltip> : row;
}

type WorkspaceRailUser = Pick<UserSummary, 'name' | 'username' | 'photo'>;

export type WorkspaceRailAccountStatus = {
  activeError: string | null;
  isFetching: boolean;
  isLoading: boolean;
  showingCachedFallback: boolean;
};

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
    <PersonalWorkspaceIcon user={user} testId="workspace-rail-footer-avatar" />
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

type TeamRailRowProps = {
  active: boolean;
  collapsed: boolean;
  onPinChange: () => void;
  onScopeChange: () => void;
  platform: string;
  pinned: boolean;
  shortcutIndex?: number;
  showShortcutHint: boolean;
  team: TeamSummary;
};

function TeamRailRow({
  active,
  collapsed,
  onPinChange,
  onScopeChange,
  platform,
  pinned,
  shortcutIndex,
  showShortcutHint,
  team,
}: TeamRailRowProps) {
  const isPrivate = team.visibility === 'private';
  const shortcutLabel = shortcutIndex ? getWorkspaceShortcutLabel(platform, shortcutIndex) : undefined;
  const ariaShortcut = shortcutIndex ? getWorkspaceAriaShortcut(platform, shortcutIndex) : undefined;

  return (
    <div className="group/team-row flex min-w-0 items-center gap-0.5">
      <WorkspaceRailButton
        accessibleLabel={isPrivate ? `${team.name}, private` : team.name}
        active={active}
        ariaKeyShortcuts={ariaShortcut}
        collapsed={collapsed}
        icon={<TeamWorkspaceIcon team={team} testId={`workspace-rail-team-logo-${team.id}`} />}
        label={team.name}
        shortcutLabel={shortcutLabel}
        showShortcutHint={showShortcutHint}
        tooltipLabel={isPrivate ? `${team.name} · Private` : team.name}
        trailing={isPrivate ? (
          <Lock aria-hidden="true" data-private-team-lock="true" className="h-3.5 w-3.5" />
        ) : null}
        onClick={onScopeChange}
      />
      {!collapsed ? (
        <Tooltip content={pinned ? `Unpin ${team.name}` : `Pin ${team.name}`} side="right">
          <button
            type="button"
            aria-label={pinned ? `Unpin ${team.name}` : `Pin ${team.name}`}
            onClick={onPinChange}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-[6px] text-text-subtle opacity-0 transition-opacity hover:bg-element-bg-hover hover:text-text-default group-focus-within/team-row:opacity-100 group-hover/team-row:opacity-100',
              FOCUS_RING_CLASS,
            )}
          >
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

function SortablePinnedTeamRow(props: Omit<TeamRailRowProps, 'pinned'>) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: props.team.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group/sortable relative', isDragging && 'z-10 opacity-60')}
    >
      <TeamRailRow {...props} pinned />
      {!props.collapsed ? (
        <Tooltip content={`Reorder ${props.team.name}`} side="right">
          <button
            type="button"
            aria-label={`Reorder ${props.team.name}`}
            className={cn(
              'absolute right-7 top-1.5 flex size-7 items-center justify-center rounded-[6px] text-text-subtle opacity-0 hover:bg-element-bg-hover hover:text-text-default focus-visible:opacity-100 group-hover/sortable:opacity-100',
              FOCUS_RING_CLASS,
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}
    </li>
  );
}

function usePrimaryModifierHints(platform: string) {
  const [visible, setVisible] = useState(false);
  const isMac = platform === 'darwin' || platform.toLowerCase().includes('mac');

  useEffect(() => {
    const isPrimaryModifier = (event: KeyboardEvent) => (
      (isMac && event.key === 'Meta') || (!isMac && event.key === 'Control')
    );
    const syncVisibility = (event: Event) => {
      const nextVisible = event.type === 'blur'
        ? false
        : event instanceof KeyboardEvent && isPrimaryModifier(event)
          ? event.type === 'keydown'
          : null;
      if (nextVisible !== null) setVisible(nextVisible);
    };
    window.addEventListener('keydown', syncVisibility);
    window.addEventListener('keyup', syncVisibility);
    window.addEventListener('blur', syncVisibility);
    return () => {
      window.removeEventListener('keydown', syncVisibility);
      window.removeEventListener('keyup', syncVisibility);
      window.removeEventListener('blur', syncVisibility);
    };
  }, [isMac]);

  return visible;
}

function PinnedTeamsSection({
  collapsed,
  headingId,
  navigation,
  onPinnedTeamIdsChange,
  onScopeChange,
  pinnedTeamIds,
  platform,
  scope,
  showShortcutHints,
  teams,
}: {
  collapsed: boolean;
  headingId: string;
  navigation: ReturnType<typeof getWorkspaceNavigationTeams>;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
  onScopeChange: (scope: WorkspaceScope) => void;
  pinnedTeamIds: string[] | null;
  platform: string;
  scope: WorkspaceScope;
  showShortcutHints: boolean;
  teams: TeamSummary[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const visibleIds = navigation.pinnedTeams.map((team) => team.id);
    const oldIndex = visibleIds.indexOf(activeId);
    const newIndex = visibleIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;

    onPinnedTeamIdsChange(reorderPinnedWorkspaceTeams(
      navigation.pinnedTeamIds,
      arrayMove(visibleIds, oldIndex, newIndex),
    ));
  };

  if (navigation.pinnedTeams.length === 0) {
    return <div data-testid="workspace-rail-team-list" />;
  }

  return (
    <>
      {!collapsed ? (
        <h2 id={headingId} className="mt-4 px-3 text-[11px] font-medium uppercase text-text-subtle">
          Pinned
        </h2>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={navigation.pinnedTeams.map((team) => team.id)} strategy={verticalListSortingStrategy}>
          <ul
            aria-label={collapsed ? 'Pinned teams' : undefined}
            aria-labelledby={collapsed ? undefined : headingId}
            data-testid="workspace-rail-team-list"
            className="mt-1.5 list-none space-y-0.5 px-2"
          >
            {navigation.pinnedTeams.map((team, index) => (
              <SortablePinnedTeamRow
                key={team.id}
                active={scope.type === 'team' && scope.teamPath === team.path}
                collapsed={collapsed}
                onPinChange={() => onPinnedTeamIdsChange(unpinWorkspaceTeam(teams, pinnedTeamIds, team.id))}
                onScopeChange={() => onScopeChange({ type: 'team', label: team.name, teamPath: team.path })}
                platform={platform}
                shortcutIndex={index < 8 ? index + 2 : undefined}
                showShortcutHint={showShortcutHints}
                team={team}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}

function MoreTeamsSection({
  collapsed,
  listId,
  navigation,
  onPinnedTeamIdsChange,
  onScopeChange,
  pinnedTeamIds,
  platform,
  scope,
  teams,
}: {
  collapsed: boolean;
  listId: string;
  navigation: ReturnType<typeof getWorkspaceNavigationTeams>;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
  onScopeChange: (scope: WorkspaceScope) => void;
  pinnedTeamIds: string[] | null;
  platform: string;
  scope: WorkspaceScope;
  teams: TeamSummary[];
}) {
  const selectedUnpinned = navigation.unpinnedTeams.some(
    (team) => scope.type === 'team' && scope.teamPath === team.path,
  );
  const [open, setOpen] = useState(false);
  const isOpen = open || selectedUnpinned;

  if (navigation.unpinnedTeams.length === 0) {
    return <div className="min-h-0 flex-1" />;
  }

  return (
    <div className="px-2 pb-3 pt-1">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-label={collapsed ? 'More teams' : undefined}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          'flex min-h-9 w-full items-center gap-2 rounded-[6px] px-2 text-sm font-medium text-text-subtle hover:bg-element-bg-hover hover:text-text-default',
          collapsed && 'justify-center',
          FOCUS_RING_CLASS,
        )}
      >
        <ChevronDown className={cn('size-4 transition-transform', !isOpen && '-rotate-90')} />
        {!collapsed ? <span>More</span> : null}
      </button>
      {isOpen ? (
        <ul id={listId} aria-label="More teams" className="mt-1 list-none space-y-0.5">
          {navigation.unpinnedTeams.map((team) => (
            <li key={team.id}>
              <TeamRailRow
                active={scope.type === 'team' && scope.teamPath === team.path}
                collapsed={collapsed}
                onPinChange={() => onPinnedTeamIdsChange(pinWorkspaceTeam(teams, pinnedTeamIds, team.id))}
                onScopeChange={() => onScopeChange({ type: 'team', label: team.name, teamPath: team.path })}
                platform={platform}
                pinned={false}
                showShortcutHint={false}
                team={team}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function WorkspaceRail({
  id,
  scope,
  user,
  teams,
  collapsed,
  accountStatus,
  width,
  platform,
  pinnedTeamIds,
  onScopeChange,
  onChooseLocalVault,
  onOpenSettings,
  onPinnedTeamIdsChange,
  localVaultConfigured,
}: {
  id: string;
  scope: WorkspaceScope;
  user?: WorkspaceRailUser;
  teams: TeamSummary[];
  collapsed: boolean;
  accountStatus?: WorkspaceRailAccountStatus;
  localVaultConfigured: boolean;
  platform: string;
  pinnedTeamIds: string[] | null;
  width: number;
  onScopeChange: (scope: WorkspaceScope) => void;
  onChooseLocalVault: () => void;
  onOpenSettings: () => void;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
}) {
  const teamsHeadingId = `${id}-teams-heading`;
  const moreListId = `${id}-more-list`;
  const navigation = useMemo(
    () => getWorkspaceNavigationTeams(teams, pinnedTeamIds),
    [pinnedTeamIds, teams],
  );
  const showShortcutHints = usePrimaryModifierHints(platform);

  return (
    <PanelShell
      id={id}
      as="aside"
      ariaLabel="Workspace switcher"
      focusZone="workspace"
      collapsed={collapsed}
      width={width}
      collapsedWidth={RAIL_COLLAPSED_WIDTH}
      className={cn('bg-background-default pt-3', collapsed && 'border-r border-border-default')}
    >
      <nav aria-label="HackMD workspaces" className="flex min-h-0 flex-1 flex-col">
        <ul aria-label="HackMD navigation" className="list-none space-y-1 px-2">
          <li>
            <WorkspaceRailButton
              active={scope.type === 'personal'}
              ariaKeyShortcuts={getWorkspaceAriaShortcut(platform, 1)}
              collapsed={collapsed}
              icon={<PersonalWorkspaceIcon user={user} testId="workspace-rail-personal-avatar" />}
              label="My Workspace"
              shortcutLabel={getWorkspaceShortcutLabel(platform, 1)}
              showShortcutHint={showShortcutHints}
              onClick={() => onScopeChange({ type: 'personal', label: 'My Workspace' })}
            />
          </li>
        </ul>

        <div data-testid="workspace-rail-team-navigation" className="min-h-0 flex-1 overflow-y-auto">
          <PinnedTeamsSection
            collapsed={collapsed}
            headingId={teamsHeadingId}
            navigation={navigation}
            onPinnedTeamIdsChange={onPinnedTeamIdsChange}
            onScopeChange={onScopeChange}
            pinnedTeamIds={pinnedTeamIds}
            platform={platform}
            scope={scope}
            showShortcutHints={showShortcutHints}
            teams={teams}
          />
          <MoreTeamsSection
            collapsed={collapsed}
            listId={moreListId}
            navigation={navigation}
            onPinnedTeamIdsChange={onPinnedTeamIdsChange}
            onScopeChange={onScopeChange}
            pinnedTeamIds={pinnedTeamIds}
            platform={platform}
            scope={scope}
            teams={teams}
          />
        </div>
      </nav>

      <div data-testid="workspace-rail-utilities" className="space-y-1 border-t border-border-default p-2">
        <WorkspaceRailButton
          active={scope.type === 'history'}
          collapsed={collapsed}
          icon={<History className="h-4 w-4" />}
          label="History"
          onClick={() => onScopeChange({ type: 'history', label: 'History' })}
        />
        <WorkspaceRailButton
          active={scope.type === 'local'}
          collapsed={collapsed}
          icon={localVaultConfigured ? <HardDrive className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
          label={localVaultConfigured ? 'Local Vault' : 'Open local folder'}
          onClick={() => {
            if (localVaultConfigured) {
              onScopeChange({ type: 'local', label: 'Local Vault' });
              return;
            }
            onChooseLocalVault();
          }}
        />
        <AccountSettingsButton collapsed={collapsed} accountStatus={accountStatus} user={user} onOpenSettings={onOpenSettings} />
      </div>
    </PanelShell>
  );
}

function getUserDisplayName(user: WorkspaceRailUser) {
  return user.name.trim() || user.username.trim() || 'Settings';
}
