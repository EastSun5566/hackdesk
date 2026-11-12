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
  Check,
  ChevronDown,
  ChevronsUpDown,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  GripVertical,
  History,
  Layers,
  Lock,
  Pin,
  PinOff,
  Search,
  Settings2,
} from 'lucide-react';
import { useContext, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { EntityRow } from './interaction-primitives';
import { localVaultFolderName } from './workspace-root-labels';
import { NavigationHintsContext } from './KeyboardNavigationContext';
import type { WorkspaceScope } from './types';
import { COLLAPSE_ICON_CLASS, FOCUS_RING_INSET_CLASS, ICON_BUTTON_CLASS } from './ui';
import {
  getWorkspaceAriaShortcut,
  getWorkspaceNavigationTeams,
  getWorkspaceShortcutLabel,
  pinWorkspaceTeam,
  reorderPinnedWorkspaceTeams,
  unpinWorkspaceTeam,
} from './workspace-navigation';
import { ActionMenuShortcut } from './ActionShortcutContext';
import { ProfileMenu } from './ProfileMenu';
import { PersonalWorkspaceIcon, TeamWorkspaceIcon } from './WorkspaceIcon';
import { useOverlay, useOverlayControls } from './WorkbenchOverlaysContext';

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
  /** Every known vault folder; the switcher lists each one to switch between them. */
  localVaults: { id: string; path: string }[];
  /** Named working sets; one row each, and the sidebar shows every folder in the open set. */
  localWorkspaces?: { id: string; name: string; vaultIds: string[] }[];
  /** The open folder and set by their stored ids, which differ from a snapshot's id. */
  activeLocalVaultId?: string | null;
  activeLocalWorkspaceId?: string | null;
  onActivateLocalWorkspace?: (id: string | null) => void;
  onOpenLocalWorkspaceFolder?: (workspaceId: string, vaultId: string) => void;
  onOpenStandaloneLocalVault?: (vaultId: string) => void;
  platform: string;
  pinnedTeamIds: string[] | null;
  onScopeChange: (scope: WorkspaceScope) => void;
  onSwitchLocalVault: (vaultId: string) => void;
  onChooseLocalVault: () => void;
  /** Opens Settings on the Vault tab, where folders and workspaces are managed. */
  onManageLocalVaults?: () => void;
  /** Opens a workspace in a new window. Leave it out to hide the open-out buttons. */
  onOpenInNewWindow?: (scope: WorkspaceScope) => void;
  onOpenSettings: () => void;
  /** Removes the HackMD token. Leave it out to hide Sign Out. */
  onSignOut?: () => void;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
};

const ROW_SELECTOR = '[data-workspace-row]';
// With more teams than this, the switcher offers a field to find one by name.
const TEAM_FILTER_THRESHOLD = 6;

function WorkspaceRow({
  active,
  ariaKeyShortcuts,
  accessibleLabel,
  icon,
  label,
  trailing,
  className,
  onClick,
  onOpenInNewWindow,
  openModifierHint,
}: {
  active: boolean;
  ariaKeyShortcuts?: string;
  accessibleLabel?: string;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  className?: string;
  onClick: (event: React.MouseEvent) => void;
  /** Opens the row's workspace in a new window: the hover button and ⌘/Ctrl-click. */
  onOpenInNewWindow?: () => void;
  openModifierHint?: string;
}) {
  const openLabel = openModifierHint
    ? `Open ${label} in a new window (${openModifierHint})`
    : `Open ${label} in a new window`;
  return (
    <div className="group/ws-row relative flex min-w-0 flex-1 items-center">
      <EntityRow
        selected={active}
        buttonProps={{ 'data-workspace-row': '' } as React.ButtonHTMLAttributes<HTMLButtonElement>}
        icon={icon}
        title={label}
        trailing={trailing ?? (active ? <Check aria-hidden="true" className="size-3.5" /> : undefined)}
        onClick={(event) => {
          if (onOpenInNewWindow && (event.metaKey || event.ctrlKey)) {
            onOpenInNewWindow();
          } else {
            onClick(event);
          }
        }}
        ariaLabel={accessibleLabel ?? label}
        ariaCurrent={active ? 'page' : undefined}
        ariaKeyShortcuts={ariaKeyShortcuts}
        className={cn('min-h-8 flex-1 py-1 text-xs', className)}
        trailingClassName={cn('opacity-70', onOpenInNewWindow && 'group-hover/ws-row:opacity-0 group-focus-within/ws-row:opacity-0')}
      />
      {onOpenInNewWindow ? (
        <div className="pointer-events-none absolute inset-y-0 right-0.5 flex items-center opacity-0 transition-opacity group-hover/ws-row:pointer-events-auto group-hover/ws-row:opacity-100 group-focus-within/ws-row:pointer-events-auto group-focus-within/ws-row:opacity-100 motion-reduce:transition-none">
          <Tooltip content={openLabel} side="right">
            <Button
              variant="ghost"
              size="icon"
              className="text-icon-default hover:bg-transparent hover:text-text-emphasize"
              aria-label={openLabel}
              onClick={(event) => {
                event.stopPropagation();
                onOpenInNewWindow();
              }}
            >
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

function ShortcutLabel({ children }: { children: string }) {
  return <kbd className="text-2xs text-text-subtle">{children}</kbd>;
}

type TeamRowProps = {
  dragHandle?: ReactNode;
  active: boolean;
  onPinChange: () => void;
  onScopeChange: () => void;
  onOpenInNewWindow?: (scope: WorkspaceScope) => void;
  openModifierHint?: string;
  platform: string;
  pinned: boolean;
  shortcutIndex?: number;
  team: TeamSummary;
};

function TeamRow({ dragHandle, active, onPinChange, onScopeChange, onOpenInNewWindow, openModifierHint, platform, pinned, shortcutIndex, team }: TeamRowProps) {
  const isPrivate = team.visibility === 'private';
  const teamScope: WorkspaceScope = { type: 'team', label: team.name, teamPath: team.path };
  const openLabel = openModifierHint
    ? `Open ${team.name} in a new window (${openModifierHint})`
    : `Open ${team.name} in a new window`;
  // The pin (and its tooltip) mounts only while the row is pointed at or focused: the switcher
  // lists every team, and a tooltip per row made opening it noticeably slow.
  const [showPin, setShowPin] = useState(false);
  return (
    <div
      className="group/team-row relative flex min-w-0 items-center"
      onPointerEnter={() => setShowPin(true)}
      onPointerLeave={() => setShowPin(false)}
      onFocus={() => setShowPin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowPin(false);
      }}
    >
      <WorkspaceRow
        accessibleLabel={isPrivate ? `${team.name}, private` : team.name}
        active={active}
        ariaKeyShortcuts={shortcutIndex ? getWorkspaceAriaShortcut(platform, shortcutIndex) : undefined}
        icon={<span className={cn('flex items-center gap-1', dragHandle && 'group-hover/team-row:opacity-0 group-focus-within/team-row:opacity-0')}><TeamWorkspaceIcon team={team} className="size-4.5" testId={`workspace-switcher-team-logo-${team.id}`} /></span>}
        label={team.name}
        // The pin takes this spot on hover, so the hints step aside rather than sit under a mask.
        trailing={(
          <span className="flex items-center gap-1.5 transition-opacity group-hover/team-row:opacity-0 group-focus-within/team-row:opacity-0">
            {isPrivate ? <Lock aria-hidden="true" data-private-team-lock="true" className="size-3.5" /> : null}
            {shortcutIndex ? <ShortcutLabel>{getWorkspaceShortcutLabel(platform, shortcutIndex)}</ShortcutLabel> : null}
          </span>
        )}
        onClick={(event) => {
          if (onOpenInNewWindow && (event.metaKey || event.ctrlKey)) {
            onOpenInNewWindow(teamScope);
          } else {
            onScopeChange();
          }
        }}
        // One hover tint for the whole row, the pin included.
        className={cn(!active && 'group-hover/team-row:bg-background-hover group-focus-within/team-row:bg-background-hover')}
      />
      {dragHandle}
      {showPin ? <div className="pointer-events-none absolute inset-y-0 right-0.5 flex items-center opacity-0 group-hover/team-row:pointer-events-auto group-hover/team-row:opacity-100 group-focus-within/team-row:pointer-events-auto group-focus-within/team-row:opacity-100">
        {onOpenInNewWindow ? (
          <Tooltip content={openLabel} side="right">
            <Button
              variant="ghost"
              size="icon"
              className="text-icon-default hover:bg-transparent hover:text-text-emphasize"
              aria-label={openLabel}
              onClick={(event) => {
                event.stopPropagation();
                onOpenInNewWindow(teamScope);
              }}
            >
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Button>
          </Tooltip>
        ) : null}
        <Tooltip content={pinned ? `Unpin ${team.name}` : `Pin ${team.name}`} side="right">
          <Button variant="ghost" size="icon" className="text-icon-default hover:bg-transparent hover:text-text-emphasize" aria-label={pinned ? `Unpin ${team.name}` : `Pin ${team.name}`} onClick={onPinChange}>
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </Button>
        </Tooltip>
      </div> : null}
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
  onOpenInNewWindow,
  openModifierHint,
  pinnedTeamIds,
  platform,
  scope,
  teams,
}: {
  navigation: ReturnType<typeof getWorkspaceNavigationTeams>;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
  onScopeChange: (scope: WorkspaceScope) => void;
  onOpenInNewWindow?: (scope: WorkspaceScope) => void;
  openModifierHint?: string;
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
                onOpenInNewWindow={onOpenInNewWindow}
                openModifierHint={openModifierHint}
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
  onOpenInNewWindow,
  openModifierHint,
  pinnedTeamIds,
  platform,
  scope,
  teams,
}: {
  navigation: ReturnType<typeof getWorkspaceNavigationTeams>;
  onPinnedTeamIdsChange: (pinnedTeamIds: string[]) => void;
  onScopeChange: (scope: WorkspaceScope) => void;
  onOpenInNewWindow?: (scope: WorkspaceScope) => void;
  openModifierHint?: string;
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
        className={cn('flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-medium text-text-subtle hover:bg-element-bg-hover hover:text-text-default', FOCUS_RING_INSET_CLASS)}
      >
        <ChevronDown className={cn('size-4', COLLAPSE_ICON_CLASS, !isOpen && '-rotate-90')} />
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
                onOpenInNewWindow={onOpenInNewWindow}
                openModifierHint={openModifierHint}
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
      className="pointer-events-none fixed left-(--peek-left) top-(--peek-top) z-30 w-64 origin-top-left rounded-md border border-border-default bg-background-default p-1.5 text-sm text-text-default shadow-lg ease-out animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
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

/** A glyph in the box workspace avatars use (20px in the header, 18px in the switcher), so every icon has one size. */
function IconBox({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return <span className={cn('flex items-center justify-center', small ? 'size-4.5' : 'size-5')}>{children}</span>;
}

function ScopeIcon({ scope, teams, user, isLocalWorkspace }: { scope: WorkspaceScope; teams: TeamSummary[]; user?: WorkspaceUser; isLocalWorkspace?: boolean }) {
  if (scope.type === 'team') {
    const team = teams.find((candidate) => candidate.path === scope.teamPath);
    if (team) return <TeamWorkspaceIcon team={team} className="size-5" testId="workspace-switcher-current-logo" />;
  }
  if (scope.type === 'local') return <IconBox>{isLocalWorkspace ? <Layers className="size-4" /> : <FolderOpen className="size-4" />}</IconBox>;
  if (scope.type === 'history') return <IconBox><History className="size-4" /></IconBox>;
  return <PersonalWorkspaceIcon user={user} className="size-5" testId="workspace-switcher-current-avatar" />;
}

/**
 * The sidebar title: the current workspace, which opens a list of the others. Up and Down move
 * between its rows, Enter switches, and Escape returns to the button.
 */
export function WorkspaceSwitcher({
  scope,
  user,
  teams,
  localVaults,
  localWorkspaces = [],
  activeLocalVaultId = null,
  activeLocalWorkspaceId = null,
  onActivateLocalWorkspace,
  onOpenLocalWorkspaceFolder,
  onOpenStandaloneLocalVault,
  platform,
  pinnedTeamIds,
  onScopeChange,
  onSwitchLocalVault,
  onChooseLocalVault,
  onManageLocalVaults,
  onOpenInNewWindow,
  onPinnedTeamIdsChange,
}: Omit<WorkspaceSidebarProps, 'accountStatus' | 'onOpenSettings' | 'onSignOut'>) {
  const overlayControls = useOverlayControls();
  const switcherOpen = useOverlay((overlays) => overlays.workspaceSwitcher);
  const onSwitcherOpenChange = (open: boolean) => overlayControls.set('workspaceSwitcher', open);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hintsHeld = useContext(NavigationHintsContext) === true;
  const navigation = useMemo(() => getWorkspaceNavigationTeams(teams, pinnedTeamIds), [pinnedTeamIds, teams]);
  const choose = (next: WorkspaceScope) => {
    onSwitcherOpenChange(false);
    onScopeChange(next);
  };
  // A workspace opens in a new window from its hover button or ⌘/Ctrl-click.
  const openModifierHint = platform === 'darwin' ? '⌘-click' : 'Ctrl-click';
  // Every folder can also be opened on its own, even when it belongs to a workspace.
  const looseLocalVaults = localVaults;
  const openOut = onOpenInNewWindow ? (next: WorkspaceScope) => {
    onSwitcherOpenChange(false);
    onOpenInNewWindow(next);
  } : undefined;
  const [teamQuery, setTeamQuery] = useState('');
  const [expandedLocalWorkspaces, setExpandedLocalWorkspaces] = useState<Set<string>>(new Set());
  // Each opening starts with the whole list.
  if (!switcherOpen && teamQuery) setTeamQuery('');
  const teamFilterRef = useRef<HTMLInputElement | null>(null);
  const teamListRef = useRef<HTMLDivElement | null>(null);
  const filteredTeams = useMemo(() => {
    const query = teamQuery.trim().toLowerCase();
    if (!query) return [];
    return teams.filter((team) => team.name.toLowerCase().includes(query) || team.path.toLowerCase().includes(query));
  }, [teamQuery, teams]);

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    // Typing a letter anywhere in the switcher starts finding a team.
    const filter = teamFilterRef.current;
    if (filter && event.target !== filter && event.key.length === 1 && /\S/.test(event.key)
      && !event.metaKey && !event.ctrlKey && !event.altKey && !event.nativeEvent.isComposing) {
      // The keypress began on a row, so the field never receives it: carry the character over,
      // or the first letter of every search would be lost.
      event.preventDefault();
      setTeamQuery((query) => query + event.key);
      filter.focus();
      return;
    }
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
        // The same 32px box and corners as the header's icon buttons beside it.
        className={cn('-ml-2 flex h-8 min-w-0 max-w-full items-center gap-2 rounded px-1.5 text-left hover:bg-element-bg-hover', FOCUS_RING_INSET_CLASS)}
      >
        <span aria-hidden="true" className="flex shrink-0 text-text-subtle"><ScopeIcon scope={scope} teams={teams} user={user} isLocalWorkspace={Boolean(activeLocalWorkspaceId && localWorkspaces.some((workspace) => workspace.id === activeLocalWorkspaceId && workspace.vaultIds.includes(activeLocalVaultId ?? '')))} /></span>
        <span className="min-w-0 truncate text-sm font-semibold text-text-default">{scope.label}</span>
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-text-subtle" />
      </PopoverTrigger>
      <PopoverContent
        ref={popupRef}
        aria-label="Workspaces"
        initialFocus={() => popupRef.current?.querySelector<HTMLElement>(`${ROW_SELECTOR}[aria-current="page"]`) ?? popupRef.current?.querySelector<HTMLElement>(ROW_SELECTOR) ?? true}
        onKeyDown={moveFocus}
        className="w-72 overflow-hidden"
      >
        <nav aria-label="Workspaces" className="flex max-h-128 flex-col">
          {/* Local folders stay above the teams, even when the team list is long. */}
          <div className="flex flex-col gap-0.5 p-1.5">
            <ul className="list-none space-y-0.5 p-0 pb-1">
              <li className="flex">
                <WorkspaceRow
                  active={scope.type === 'personal'}
                  ariaKeyShortcuts={getWorkspaceAriaShortcut(platform, 1)}
                  icon={<PersonalWorkspaceIcon user={user} className="size-4.5" testId="workspace-switcher-personal-avatar" />}
                  label="My Workspace"
                  trailing={<ShortcutLabel>{getWorkspaceShortcutLabel(platform, 1)}</ShortcutLabel>}
                  onClick={() => choose({ type: 'personal', label: 'My Workspace' })}
                  onOpenInNewWindow={openOut ? () => openOut({ type: 'personal', label: 'My Workspace' }) : undefined}
                  openModifierHint={openModifierHint}
                />
              </li>
            </ul>
            {/* Local folders are the workspace's places too, so they stay above the teams: a long
                team list must not push the open folder out of reach. */}
            {localWorkspaces.length > 0 || localVaults.length > 0 ? (
              <div className="flex flex-col border-t border-border-subtle pt-1">
                <div className="flex items-center justify-between pl-2 pr-0.5">
                  <p className="text-2xs font-medium uppercase text-text-subtle">{localWorkspaces.length ? 'Local workspaces' : 'Local folders'}</p>
                  <span className="flex items-center">
                  {onManageLocalVaults ? (
                    <Tooltip content="Manage local folders">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Manage local folders"
                        onClick={() => {
                          onSwitcherOpenChange(false);
                          onManageLocalVaults();
                        }}
                      >
                        <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                  ) : null}
                  <Tooltip content="Add local folder">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Add local folder"
                      onClick={() => {
                        onSwitcherOpenChange(false);
                        onChooseLocalVault();
                      }}
                    >
                      <FolderPlus aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                  </span>
                </div>
                <ul className="max-h-64 list-none space-y-0.5 overflow-y-auto p-0 scroll-py-1">
                  {localWorkspaces.map((workspace) => {
                    const active = scope.type === 'local' && workspace.id === activeLocalWorkspaceId
                      && (!activeLocalVaultId || workspace.vaultIds.includes(activeLocalVaultId));
                    const folderCount = workspace.vaultIds
                      .filter((vaultId) => localVaults.some((vault) => vault.id === vaultId))
                      .length;
                    return (
                      <li key={`workspace:${workspace.id}`}>
                        <div className="flex items-center">
                        <button type="button" aria-label={`${expandedLocalWorkspaces.has(workspace.id) ? 'Hide' : 'Show'} folders in ${workspace.name}`} aria-expanded={expandedLocalWorkspaces.has(workspace.id)} className={cn('flex size-6 shrink-0 items-center justify-center rounded text-text-subtle hover:bg-element-bg-hover', FOCUS_RING_INSET_CLASS)} onClick={() => setExpandedLocalWorkspaces((current) => { const next = new Set(current); if (next.has(workspace.id)) next.delete(workspace.id); else next.add(workspace.id); return next; })}><ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform motion-reduce:transition-none', !expandedLocalWorkspaces.has(workspace.id) && '-rotate-90')} /></button>
                        <WorkspaceRow
                          active={active}
                          icon={<IconBox small><Layers className="size-3.5" /></IconBox>}
                          label={workspace.name}
                          trailing={<span className="text-xs tabular-nums text-text-subtle">{folderCount}</span>}
                          onClick={() => {
                            onSwitcherOpenChange(false);
                            onActivateLocalWorkspace?.(workspace.id);
                          }}
                          onOpenInNewWindow={openOut ? () => openOut({ type: 'local', label: workspace.name, workspaceId: workspace.id }) : undefined}
                          openModifierHint={openModifierHint}
                        />
                        </div>
                        {expandedLocalWorkspaces.has(workspace.id) ? <ul aria-label={`Folders in ${workspace.name}`} className="ml-6 list-none border-l border-border-subtle pl-1">
                          {workspace.vaultIds.flatMap((id) => { const vault = localVaults.find((item) => item.id === id); if (!vault) return []; const name = localVaultFolderName(vault.path); return [<li key={id} className="group/local-folder flex items-center"><WorkspaceRow active={false} accessibleLabel={`Open ${name} in ${workspace.name}`} icon={<IconBox small><FolderOpen className="size-3.5" /></IconBox>} label={name} trailing={active && activeLocalVaultId === id ? <Check aria-label="Current folder" className="size-3.5" /> : undefined} onClick={() => { onSwitcherOpenChange(false); onOpenLocalWorkspaceFolder?.(workspace.id, id); }} /></li>]; })}
                        </ul> : null}
                      </li>
                    );
                  })}
                  {looseLocalVaults.length && localWorkspaces.length ? <li className="px-2 pb-1 pt-2 text-2xs font-medium uppercase text-text-subtle">Folders · open on their own</li> : null}
                  {looseLocalVaults.map((vault) => {
                    const folderName = localVaultFolderName(vault.path);
                    const active = scope.type === 'local' && !activeLocalWorkspaceId && activeLocalVaultId === vault.id;
                    return (
                      <li key={vault.id} className="flex">
                        <WorkspaceRow
                          active={active}
                          icon={<IconBox small><FolderOpen className="size-3.5" /></IconBox>}
                          label={folderName}
                          onClick={() => {
                            onSwitcherOpenChange(false);
                            if (onOpenStandaloneLocalVault) onOpenStandaloneLocalVault(vault.id);
                            else onSwitchLocalVault(vault.id);
                          }}
                          onOpenInNewWindow={openOut ? () => openOut({ type: 'local', label: folderName, vaultId: vault.id }) : undefined}
                          openModifierHint={openModifierHint}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <ul className="list-none space-y-0.5 p-0">
                <li className="flex">
                  <WorkspaceRow
                    active={false}
                    icon={<IconBox small><FolderOpen className="size-3.5" /></IconBox>}
                    label="Open local folder"
                    trailing={<span />}
                    onClick={() => {
                      onSwitcherOpenChange(false);
                      onChooseLocalVault();
                    }}
                    openModifierHint={openModifierHint}
                  />
                </li>
              </ul>
            )}
          </div>
          {teams.length > 0 ? (
            <div className="flex min-h-0 flex-col border-t border-border-subtle">
              {teams.length > TEAM_FILTER_THRESHOLD ? (
                <label className="mx-1.5 mt-1.5 flex h-8 shrink-0 items-center gap-2 rounded-md border border-border-default px-2 focus-within:border-border-primary-subtler">
                  <Search aria-hidden="true" className="size-3.5 shrink-0 text-icon-default" />
                  <input
                    ref={teamFilterRef}
                    value={teamQuery}
                    onChange={(event) => setTeamQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return;
                      if (event.key === 'Enter' && filteredTeams[0]) {
                        event.preventDefault();
                        const team = filteredTeams[0];
                        choose({ type: 'team', label: team.name, teamPath: team.path });
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        teamListRef.current?.querySelector<HTMLElement>(ROW_SELECTOR)?.focus();
                      } else if (event.key === 'Escape' && teamQuery) {
                        event.preventDefault();
                        event.stopPropagation();
                        setTeamQuery('');
                      }
                    }}
                    placeholder="Find a team"
                    aria-label="Find a team"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-xs text-text-default outline-none placeholder:text-text-subtle"
                  />
                </label>
              ) : null}
              {/* The padding belongs to the scrolling list, so rows scroll to the edge instead of
                  being clipped short of it, and keyboard focus scrolls a row clear of the edge. */}
              <div ref={teamListRef} className="min-h-0 scroll-py-1.5 overflow-y-auto p-1.5 pt-0">
                {teamQuery.trim() ? (
                  filteredTeams.length ? (
                    <ul aria-label="Matching teams" className="mt-1.5 list-none space-y-0.5">
                      {filteredTeams.map((team) => {
                        const pinned = navigation.pinnedTeams.some((candidate) => candidate.id === team.id);
                        return (
                          <li key={team.id}>
                            <TeamRow
                              active={scope.type === 'team' && scope.teamPath === team.path}
                              onPinChange={() => onPinnedTeamIdsChange(pinned
                                ? unpinWorkspaceTeam(teams, pinnedTeamIds, team.id)
                                : pinWorkspaceTeam(teams, pinnedTeamIds, team.id))}
                              onScopeChange={() => choose({ type: 'team', label: team.name, teamPath: team.path })}
                              onOpenInNewWindow={openOut}
                              openModifierHint={openModifierHint}
                              platform={platform}
                              pinned={pinned}
                              team={team}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p role="status" className="px-2 py-3 text-xs text-text-subtle">No teams match.</p>
                ) : (
                  <>
                    <PinnedTeams navigation={navigation} onPinnedTeamIdsChange={onPinnedTeamIdsChange} onScopeChange={choose} onOpenInNewWindow={openOut} openModifierHint={openModifierHint} pinnedTeamIds={pinnedTeamIds} platform={platform} scope={scope} teams={teams} />
                    <MoreTeams navigation={navigation} onPinnedTeamIdsChange={onPinnedTeamIdsChange} onScopeChange={choose} onOpenInNewWindow={openOut} openModifierHint={openModifierHint} pinnedTeamIds={pinnedTeamIds} platform={platform} scope={scope} teams={teams} />
                  </>
                )}
              </div>
            </div>
          ) : null}
        </nav>
      </PopoverContent>
      {hintsHeld && !switcherOpen ? <WorkspacePeek anchorRef={triggerRef} navigation={navigation} platform={platform} user={user} /> : null}
    </Popover>
  );
}

/** The bottom of the sidebar: the account hub and Settings. */
export function SidebarFooter({
  accountStatus,
  user,
  onOpenSettings,
  onSignOut,
}: Pick<WorkspaceSidebarProps, 'accountStatus' | 'user' | 'onOpenSettings' | 'onSignOut'>) {
  const hasAccountAttention = Boolean(accountStatus?.activeError);
  const isLoadingAccount = !user && Boolean(accountStatus?.isLoading || accountStatus?.isFetching);

  return (
    // No divider: the footer sits in the chrome like the header. Its 32px row ends 1px above the
    // footer's bottom, where the editor card's border is, so it shares a centre line with the
    // editor's status bar.
    <div data-testid="sidebar-footer" className="flex shrink-0 items-center gap-1 px-2 pb-px pt-1.5">
      <ProfileMenu
        user={user}
        needsAttention={hasAccountAttention}
        attentionTone={accountStatus?.showingCachedFallback ? 'primary' : 'destructive'}
        loading={isLoadingAccount}
        onOpenSettings={onOpenSettings}
        onConnect={onOpenSettings}
        onSignOut={onSignOut}
      />
      <Tooltip content={<>Settings <ActionMenuShortcut actionId="open-settings" /></>} side="top">
        {/* The footer sits on the sidebar's bottom edge, so its rings draw inside the buttons. */}
        <button type="button" aria-label="Settings" className={cn(ICON_BUTTON_CLASS, 'focus-visible:ring-inset')} onClick={onOpenSettings}>
          <Settings2 aria-hidden="true" className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
