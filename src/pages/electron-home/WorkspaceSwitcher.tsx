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
  Check,
  ChevronDown,
  ChevronsUpDown,
  FolderOpen,
  GripVertical,
  HardDrive,
  History,
  Lock,
  Pin,
  PinOff,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useContext, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { EntityRow } from './interaction-primitives';
import { NavigationHintsContext } from './KeyboardNavigationContext';
import type { WorkspaceScope } from './types';
import { FOCUS_RING_INSET_CLASS } from './ui';
import {
  getWorkspaceAriaShortcut,
  getWorkspaceNavigationTeams,
  getWorkspaceShortcutLabel,
  pinWorkspaceTeam,
  reorderPinnedWorkspaceTeams,
  unpinWorkspaceTeam,
} from './workspace-navigation';
import { PersonalWorkspaceIcon, TeamWorkspaceIcon } from './WorkspaceIcon';

type WorkspaceUser = Pick<UserSummary, 'name' | 'username' | 'photo'>;

export type WorkspaceAccountStatus = {
  activeError: string | null;
  isFetching: boolean;
  isLoading: boolean;
  showingCachedFallback: boolean;
};

export type WorkspaceSidebarProps = {
  scope: WorkspaceScope;
  user?: WorkspaceUser;
  teams: TeamSummary[];
  accountStatus?: WorkspaceAccountStatus;
  localVaultConfigured: boolean;
  platform: string;
  pinnedTeamIds: string[] | null;
  switcherOpen: boolean;
  onSwitcherOpenChange: (open: boolean) => void;
  onScopeChange: (scope: WorkspaceScope) => void;
  onChooseLocalVault: () => void;
  onOpenSettings: () => void;
  /** Opens the HackMD trash. Leave it out to hide the button. */
  onOpenTrash?: () => void;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
};

const ROW_SELECTOR = '[data-workspace-row]';

function WorkspaceRow({
  active,
  ariaKeyShortcuts,
  accessibleLabel,
  icon,
  label,
  trailing,
  className,
  onClick,
}: {
  active: boolean;
  ariaKeyShortcuts?: string;
  accessibleLabel?: string;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <EntityRow
      selected={active}
      buttonProps={{ 'data-workspace-row': '' } as React.ButtonHTMLAttributes<HTMLButtonElement>}
      icon={icon}
      title={label}
      trailing={trailing ?? (active ? <Check aria-hidden="true" className="size-3.5" /> : undefined)}
      variant="compact"
      onClick={onClick}
      ariaLabel={accessibleLabel ?? label}
      ariaCurrent={active ? 'page' : undefined}
      ariaKeyShortcuts={ariaKeyShortcuts}
      className={cn('min-h-9 flex-1', className)}
      trailingClassName="opacity-70"
    />
  );
}

function ShortcutLabel({ children }: { children: string }) {
  return <kbd className="font-mono text-2xs text-text-subtle">{children}</kbd>;
}

type TeamRowProps = {
  dragHandle?: ReactNode;
  active: boolean;
  onPinChange: () => void;
  onScopeChange: () => void;
  platform: string;
  pinned: boolean;
  shortcutIndex?: number;
  team: TeamSummary;
};

function TeamRow({ dragHandle, active, onPinChange, onScopeChange, platform, pinned, shortcutIndex, team }: TeamRowProps) {
  const isPrivate = team.visibility === 'private';
  return (
    <div className="group/team-row relative flex min-w-0 items-center">
      <WorkspaceRow
        accessibleLabel={isPrivate ? `${team.name}, private` : team.name}
        active={active}
        ariaKeyShortcuts={shortcutIndex ? getWorkspaceAriaShortcut(platform, shortcutIndex) : undefined}
        icon={<span className={cn('flex items-center gap-1', dragHandle && 'group-hover/team-row:opacity-0 group-focus-within/team-row:opacity-0')}><TeamWorkspaceIcon team={team} testId={`workspace-switcher-team-logo-${team.id}`} /></span>}
        label={team.name}
        trailing={(
          <span className="flex items-center gap-1.5">
            {isPrivate ? <Lock aria-hidden="true" data-private-team-lock="true" className="size-3.5" /> : null}
            {shortcutIndex ? <ShortcutLabel>{getWorkspaceShortcutLabel(platform, shortcutIndex)}</ShortcutLabel> : null}
          </span>
        )}
        onClick={onScopeChange}
        className={cn(!active && 'group-hover/team-row:bg-element-bg-hover group-focus-within/team-row:bg-element-bg-hover')}
      />
      {dragHandle}
      <div className={cn(
        'pointer-events-none absolute inset-y-1 right-1 flex items-center rounded-md pl-10 opacity-0 group-hover/team-row:pointer-events-auto group-hover/team-row:opacity-100 group-focus-within/team-row:pointer-events-auto group-focus-within/team-row:opacity-100',
        active ? 'bg-background-selected-solid' : 'bg-element-bg-hover-solid',
      )}>
        <Tooltip content={pinned ? `Unpin ${team.name}` : `Pin ${team.name}`} side="right">
          <Button variant="ghost" size="icon" aria-label={pinned ? `Unpin ${team.name}` : `Pin ${team.name}`} onClick={onPinChange}>
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

function SortablePinnedTeamRow(props: Omit<TeamRowProps, 'pinned'>) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({ id: props.team.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-hackdesk-dragging={isDragging || undefined}
      className={cn('relative', isDragging && 'z-10 opacity-60')}
    >
      <TeamRow {...props} pinned dragHandle={
        <Tooltip content={`Reorder ${props.team.name}`} side="right">
          <button
            type="button"
            aria-label={`Reorder ${props.team.name}`}
            ref={setActivatorNodeRef}
            className={cn(
              'pointer-events-none absolute inset-y-0 left-1 flex w-8 items-center justify-center rounded-md text-text-subtle opacity-0 hover:text-text-default group-focus-within/team-row:pointer-events-auto group-focus-within/team-row:opacity-100 group-hover/team-row:pointer-events-auto group-hover/team-row:opacity-100',
              FOCUS_RING_INSET_CLASS,
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        </Tooltip>
      } />
    </li>
  );
}

function PinnedTeams({
  navigation,
  onPinnedTeamIdsChange,
  onScopeChange,
  pinnedTeamIds,
  platform,
  scope,
  teams,
}: {
  navigation: ReturnType<typeof getWorkspaceNavigationTeams>;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
  onScopeChange: (scope: WorkspaceScope) => void;
  pinnedTeamIds: string[] | null;
  platform: string;
  scope: WorkspaceScope;
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
    onPinnedTeamIdsChange(reorderPinnedWorkspaceTeams(navigation.pinnedTeamIds, arrayMove(visibleIds, oldIndex, newIndex)));
  };
  if (navigation.pinnedTeams.length === 0) return null;
  return (
    <>
      <h3 id="workspace-switcher-pinned" className="mt-2 px-2 text-2xs font-medium uppercase text-text-subtle">Pinned</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={navigation.pinnedTeams.map((team) => team.id)} strategy={verticalListSortingStrategy}>
          <ul aria-labelledby="workspace-switcher-pinned" data-testid="workspace-switcher-team-list" className="mt-1 list-none space-y-0.5">
            {navigation.pinnedTeams.map((team, index) => (
              <SortablePinnedTeamRow
                key={team.id}
                active={scope.type === 'team' && scope.teamPath === team.path}
                onPinChange={() => onPinnedTeamIdsChange(unpinWorkspaceTeam(teams, pinnedTeamIds, team.id))}
                onScopeChange={() => onScopeChange({ type: 'team', label: team.name, teamPath: team.path })}
                platform={platform}
                shortcutIndex={index < 8 ? index + 2 : undefined}
                team={team}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}

function MoreTeams({
  navigation,
  onPinnedTeamIdsChange,
  onScopeChange,
  pinnedTeamIds,
  platform,
  scope,
  teams,
}: {
  navigation: ReturnType<typeof getWorkspaceNavigationTeams>;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
  onScopeChange: (scope: WorkspaceScope) => void;
  pinnedTeamIds: string[] | null;
  platform: string;
  scope: WorkspaceScope;
  teams: TeamSummary[];
}) {
  const selectedUnpinned = navigation.unpinnedTeams.some((team) => scope.type === 'team' && scope.teamPath === team.path);
  const [open, setOpen] = useState(false);
  const isOpen = open || selectedUnpinned;
  if (navigation.unpinnedTeams.length === 0) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        data-workspace-row=""
        aria-expanded={isOpen}
        aria-controls="workspace-switcher-more"
        onClick={() => setOpen(!isOpen)}
        className={cn('flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-text-subtle hover:bg-element-bg-hover hover:text-text-default', FOCUS_RING_INSET_CLASS)}
      >
        <ChevronDown className={cn('size-4 transition-transform', !isOpen && '-rotate-90')} />
        <span>More</span>
      </button>
      {isOpen ? (
        <ul id="workspace-switcher-more" aria-label="More teams" className="mt-1 list-none space-y-0.5">
          {navigation.unpinnedTeams.map((team) => (
            <li key={team.id}>
              <TeamRow
                active={scope.type === 'team' && scope.teamPath === team.path}
                onPinChange={() => onPinnedTeamIdsChange(pinWorkspaceTeam(teams, pinnedTeamIds, team.id))}
                onScopeChange={() => onScopeChange({ type: 'team', label: team.name, teamPath: team.path })}
                platform={platform}
                pinned={false}
                team={team}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * While the primary key is held, a read-only card beside the switcher shows which workspace each
 * number opens. It takes no pointer events, so navigation hints still see what is under it.
 */
function WorkspacePeek({
  anchorRef,
  navigation,
  platform,
  user,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  navigation: ReturnType<typeof getWorkspaceNavigationTeams>;
  platform: string;
  user?: WorkspaceUser;
}) {
  const peekRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const peek = peekRef.current;
    if (!anchor || !peek) return;
    const sidebar = anchor.closest<HTMLElement>('[data-hackdesk-focus]') ?? anchor;
    peek.style.setProperty('--peek-left', `${sidebar.getBoundingClientRect().right + 8}px`);
    peek.style.setProperty('--peek-top', `${anchor.getBoundingClientRect().top}px`);
  });
  const rows = [
    { key: 'personal', icon: <PersonalWorkspaceIcon user={user} />, label: 'My Workspace' },
    ...navigation.pinnedTeams.slice(0, 8).map(team => ({ key: team.id, icon: <TeamWorkspaceIcon team={team} />, label: team.name })),
  ];
  return createPortal(
    <div
      ref={peekRef}
      aria-hidden="true"
      data-workspace-peek
      className="pointer-events-none fixed left-(--peek-left) top-(--peek-top) z-30 w-64 rounded-md border border-border-default bg-background-default p-1.5 text-sm text-text-default shadow-lg"
    >
      <ol className="list-none space-y-0.5">
        {rows.map((row, index) => (
          <li key={row.key} className="flex min-h-8 items-center gap-2 px-1.5">
            <span className="flex shrink-0 text-text-subtle">{row.icon}</span>
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <ShortcutLabel>{getWorkspaceShortcutLabel(platform, index + 1)}</ShortcutLabel>
          </li>
        ))}
      </ol>
    </div>,
    document.body,
  );
}

function ScopeIcon({ scope, teams, user }: { scope: WorkspaceScope; teams: TeamSummary[]; user?: WorkspaceUser }) {
  if (scope.type === 'team') {
    const team = teams.find((candidate) => candidate.path === scope.teamPath);
    if (team) return <TeamWorkspaceIcon team={team} testId="workspace-switcher-current-logo" />;
  }
  if (scope.type === 'local') return <HardDrive className="size-4" />;
  if (scope.type === 'history') return <History className="size-4" />;
  return <PersonalWorkspaceIcon user={user} testId="workspace-switcher-current-avatar" />;
}

/**
 * The sidebar title: the current workspace, which opens a list of the others. Up and Down move
 * between its rows, Enter switches, and Escape returns to the button.
 */
export function WorkspaceSwitcher({
  scope,
  user,
  teams,
  localVaultConfigured,
  platform,
  pinnedTeamIds,
  switcherOpen,
  onSwitcherOpenChange,
  onScopeChange,
  onChooseLocalVault,
  onPinnedTeamIdsChange,
}: Omit<WorkspaceSidebarProps, 'accountStatus' | 'onOpenSettings' | 'onOpenTrash'>) {
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hintsHeld = useContext(NavigationHintsContext) === true;
  const navigation = useMemo(() => getWorkspaceNavigationTeams(teams, pinnedTeamIds), [pinnedTeamIds, teams]);
  const choose = (next: WorkspaceScope) => {
    onSwitcherOpenChange(false);
    onScopeChange(next);
  };
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = Array.from(popupRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? []);
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    rows[(index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
  };

  return (
    <Popover open={switcherOpen} onOpenChange={onSwitcherOpenChange}>
      <PopoverTrigger
        ref={triggerRef}
        data-workspace-navigation-id="switcher"
        aria-label={`Switch workspace, current: ${scope.label}`}
        className={cn('flex min-w-0 max-w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-element-bg-hover', FOCUS_RING_INSET_CLASS)}
      >
        <span aria-hidden="true" className="flex shrink-0 text-text-subtle"><ScopeIcon scope={scope} teams={teams} user={user} /></span>
        <span className="min-w-0 truncate text-base font-semibold text-text-default">{scope.label}</span>
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-text-subtle" />
      </PopoverTrigger>
      <PopoverContent
        ref={popupRef}
        aria-label="Workspaces"
        initialFocus={() => popupRef.current?.querySelector<HTMLElement>(`${ROW_SELECTOR}[aria-current="page"]`) ?? popupRef.current?.querySelector<HTMLElement>(ROW_SELECTOR) ?? true}
        onKeyDown={moveFocus}
        className="w-72 p-1.5"
      >
        <nav aria-label="Workspaces" className="max-h-96 overflow-y-auto">
          <ul className="list-none space-y-0.5">
            <li className="flex">
              <WorkspaceRow
                active={scope.type === 'personal'}
                ariaKeyShortcuts={getWorkspaceAriaShortcut(platform, 1)}
                icon={<PersonalWorkspaceIcon user={user} testId="workspace-switcher-personal-avatar" />}
                label="My Workspace"
                trailing={<ShortcutLabel>{getWorkspaceShortcutLabel(platform, 1)}</ShortcutLabel>}
                onClick={() => choose({ type: 'personal', label: 'My Workspace' })}
              />
            </li>
          </ul>
          <PinnedTeams navigation={navigation} onPinnedTeamIdsChange={onPinnedTeamIdsChange} onScopeChange={choose} pinnedTeamIds={pinnedTeamIds} platform={platform} scope={scope} teams={teams} />
          <MoreTeams navigation={navigation} onPinnedTeamIdsChange={onPinnedTeamIdsChange} onScopeChange={choose} pinnedTeamIds={pinnedTeamIds} platform={platform} scope={scope} teams={teams} />
          <ul className="mt-1.5 list-none space-y-0.5 border-t border-border-default pt-1.5">
            <li className="flex">
              <WorkspaceRow
                active={scope.type === 'local'}
                icon={localVaultConfigured ? <HardDrive className="size-4" /> : <FolderOpen className="size-4" />}
                label={localVaultConfigured ? 'Local Vault' : 'Open local folder'}
                trailing={localVaultConfigured ? undefined : <span />}
                onClick={() => {
                  if (localVaultConfigured) { choose({ type: 'local', label: 'Local Vault' }); return; }
                  onSwitcherOpenChange(false);
                  onChooseLocalVault();
                }}
              />
            </li>
            <li className="flex">
              <WorkspaceRow
                active={scope.type === 'history'}
                icon={<History className="size-4" />}
                label="History"
                onClick={() => choose({ type: 'history', label: 'History' })}
              />
            </li>
          </ul>
        </nav>
      </PopoverContent>
      {hintsHeld && !switcherOpen ? <WorkspacePeek anchorRef={triggerRef} navigation={navigation} platform={platform} user={user} /> : null}
    </Popover>
  );
}

function getUserDisplayName(user: WorkspaceUser) {
  return user.name.trim() || user.username.trim() || 'Settings';
}

/** The bottom of the sidebar: the account, which opens Settings, and the HackMD trash. */
export function SidebarFooter({
  accountStatus,
  user,
  onOpenSettings,
  onOpenTrash,
}: Pick<WorkspaceSidebarProps, 'accountStatus' | 'user' | 'onOpenSettings' | 'onOpenTrash'>) {
  const displayName = user ? getUserDisplayName(user) : 'Settings';
  const hasAccountAttention = Boolean(accountStatus?.activeError);
  const isLoadingAccount = !user && Boolean(accountStatus?.isLoading || accountStatus?.isFetching);
  const label = user ? `Open settings for ${displayName}` : 'Open settings';
  const trailing = hasAccountAttention ? (
    <AlertCircle
      aria-hidden="true"
      data-testid="sidebar-account-attention"
      className={cn('size-3.5', accountStatus?.showingCachedFallback ? 'text-primary-default' : 'text-destructive-default')}
    />
  ) : isLoadingAccount ? (
    <span aria-hidden="true" data-testid="sidebar-account-loading" className="block size-1.5 rounded-full bg-text-subtle opacity-70 motion-safe:animate-pulse" />
  ) : (
    <Settings2 className="size-3.5" />
  );

  return (
    <div data-testid="sidebar-footer" className="flex items-center gap-1 border-t border-border-default p-1.5">
      <EntityRow
        icon={user ? <PersonalWorkspaceIcon user={user} testId="sidebar-footer-avatar" /> : <Settings2 className="size-4" />}
        title={displayName}
        subtitle={user ? `@${user.username}` : undefined}
        trailing={trailing}
        variant="compact"
        onClick={onOpenSettings}
        ariaLabel={hasAccountAttention ? `${label}. HackMD account needs attention` : label}
        className="min-h-11 min-w-0 flex-1"
        trailingClassName="text-text-subtle"
      />
      {onOpenTrash ? (
        <Tooltip content="Trash" side="top">
          <Button variant="ghost" size="icon" aria-label="Trash" data-workspace-navigation-id="trash" onClick={onOpenTrash}>
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
}
