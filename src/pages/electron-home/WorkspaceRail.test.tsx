import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { TooltipProvider } from '@/components/ui/tooltip';

import { WorkspaceRail } from './WorkspaceRail';

function user(overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    id: 'user-1',
    email: 'michael@example.com',
    name: 'Michael Lee',
    username: 'michael',
    photo: null,
    upgraded: false,
    teams: [],
    ...overrides,
  };
}

function team(overrides: Partial<TeamSummary> = {}): TeamSummary {
  return {
    id: 'team-1',
    ownerId: 'user-1',
    name: "Michael's Team",
    logo: null,
    path: 'michaels-team',
    description: null,
    visibility: 'public',
    createdAtMillis: null,
    upgraded: false,
    ...overrides,
  };
}

function renderWorkspaceRail(overrides: Partial<Parameters<typeof WorkspaceRail>[0]> = {}) {
  const props: Parameters<typeof WorkspaceRail>[0] = {
    id: 'workspace-rail',
    scope: { type: 'personal', label: 'My Workspace' },
    user: undefined,
    teams: [],
    collapsed: false,
    localVaultConfigured: false,
    platform: 'darwin',
    pinnedTeamIds: null,
    width: 72,
    onChooseLocalVault: vi.fn(),
    onScopeChange: vi.fn(),
    onOpenSettings: vi.fn(),
    onPinnedTeamIdsChange: vi.fn(),
    ...overrides,
  };

  render(
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <WorkspaceRail {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe('WorkspaceRail', () => {
  it('starts with workspace navigation instead of duplicated product identity', () => {
    renderWorkspaceRail({
      user: user(),
      teams: [],
    });

    expect(screen.queryByText('HackDesk')).toBeNull();
    expect(screen.queryByText('Michael Lee @michael')).toBeNull();
    expect(screen.queryByText('Teams')).toBeNull();
    expect(screen.getByRole('button', { name: 'My Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Workspace switcher' })).not.toHaveClass('border-r');
  });

  it('keeps one boundary when the resize sash is hidden for the collapsed rail', () => {
    renderWorkspaceRail({ collapsed: true });

    expect(screen.getByRole('complementary', { name: 'Workspace switcher' })).toHaveClass(
      'border-r',
      'border-border-default',
    );
  });

  it('orders remote workspaces before fixed local and account utilities', () => {
    const selectedTeam = team();
    renderWorkspaceRail({ teams: [selectedTeam] });

    const rail = screen.getByRole('complementary', { name: 'Workspace switcher' });
    const personalButton = within(rail).getByRole('button', { name: 'My Workspace' });
    const teamButton = within(rail).getByRole('button', { name: selectedTeam.name });
    const historyButton = within(rail).getByRole('button', { name: 'History' });
    expect(personalButton.compareDocumentPosition(teamButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(teamButton.compareDocumentPosition(historyButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const teamList = screen.getByTestId('workspace-rail-team-list');
    const utilities = screen.getByTestId('workspace-rail-utilities');
    expect(teamList).toContainElement(screen.getByRole('button', { name: selectedTeam.name }));
    expect(teamList).not.toContainElement(screen.getByRole('button', { name: 'Open local folder' }));
    expect(utilities).toContainElement(screen.getByRole('button', { name: 'Open local folder' }));
    expect(utilities).toContainElement(screen.getByRole('button', { name: 'Open settings' }));
  });

  it('keeps team navigation scrollable without moving the utilities', () => {
    renderWorkspaceRail({ teams: [team()] });

    const teamNavigation = screen.getByTestId('workspace-rail-team-navigation');
    const utilities = screen.getByTestId('workspace-rail-utilities');
    expect(teamNavigation).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(teamNavigation).toContainElement(screen.getByTestId('workspace-rail-team-list'));
    expect(teamNavigation).not.toContainElement(utilities);
  });

  it('exposes primary and team navigation as semantic lists', () => {
    const selectedTeam = team();
    renderWorkspaceRail({ teams: [selectedTeam] });

    const primaryList = screen.getByRole('list', { name: 'HackMD navigation' });
    const navigation = screen.getByRole('navigation', { name: 'HackMD workspaces' });
    const teamsHeading = screen.getByRole('heading', { level: 2, name: 'Pinned' });
    const teamsList = screen.getByRole('list', { name: 'Pinned' });

    expect(navigation).toContainElement(primaryList);
    expect(navigation).toContainElement(teamsList);
    expect(within(primaryList).getAllByRole('listitem')).toHaveLength(1);
    expect(teamsHeading).toBeVisible();
    expect(within(teamsList).getAllByRole('listitem')).toHaveLength(1);
    expect(teamsList).toHaveAttribute('aria-labelledby', teamsHeading.id);
  });

  it('opens the local vault picker when no vault is configured', () => {
    const props = renderWorkspaceRail({ localVaultConfigured: false });

    const openLocalFolderButton = screen.getByRole('button', { name: 'Open local folder' });
    expect(openLocalFolderButton.querySelector('.lucide-folder-open')).toBeInTheDocument();
    fireEvent.click(openLocalFolderButton);

    expect(props.onChooseLocalVault).toHaveBeenCalledOnce();
    expect(props.onScopeChange).not.toHaveBeenCalled();
  });

  it('switches to local workspace after a vault is configured', () => {
    const props = renderWorkspaceRail({ localVaultConfigured: true });

    const localVaultButton = screen.getByRole('button', { name: 'Local Vault' });
    expect(localVaultButton.querySelector('.lucide-hard-drive')).toBeInTheDocument();
    fireEvent.click(localVaultButton);

    expect(props.onScopeChange).toHaveBeenCalledWith({ type: 'local', label: 'Local Vault' });
    expect(props.onChooseLocalVault).not.toHaveBeenCalled();
  });

  it('keeps personal, history, and team scope payloads unchanged', () => {
    const selectedTeam = team();
    const props = renderWorkspaceRail({
      teams: [selectedTeam],
      localVaultConfigured: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'My Workspace' }));
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(screen.getByRole('button', { name: selectedTeam.name }));

    expect(props.onScopeChange).toHaveBeenNthCalledWith(1, { type: 'personal', label: 'My Workspace' });
    expect(props.onScopeChange).toHaveBeenNthCalledWith(2, { type: 'history', label: 'History' });
    expect(props.onScopeChange).toHaveBeenNthCalledWith(3, {
      type: 'team',
      label: selectedTeam.name,
      teamPath: selectedTeam.path,
    });
  });

  it('exposes the active workspace without relying on color alone', () => {
    renderWorkspaceRail({
      scope: { type: 'history', label: 'History' },
      localVaultConfigured: true,
      teams: [team()],
    });

    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'My Workspace' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Local Vault' })).not.toHaveAttribute('aria-current');
  });

  it('uses the connected user avatar for My Workspace without changing its accessible name', () => {
    renderWorkspaceRail({
      user: user({ photo: 'https://cdn.example/avatar.png' }),
    });

    const personalButton = screen.getByRole('button', { name: 'My Workspace' });
    const avatar = screen.getByTestId('workspace-rail-personal-avatar');

    expect(personalButton).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', 'https://cdn.example/avatar.png');
    expect(avatar).toHaveAttribute('alt', '');
    expect(avatar).toHaveAttribute('width', '24');
    expect(avatar).toHaveAttribute('height', '24');
    expect(avatar).toHaveAttribute('loading', 'lazy');
    expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('falls back to user initials when the connected user has no avatar photo', () => {
    renderWorkspaceRail({
      user: user({ name: 'Michael Lee', photo: null }),
    });

    expect(screen.getByTestId('workspace-rail-personal-avatar')).toHaveTextContent('ML');
  });

  it('falls back to initials when user and team images fail to load', () => {
    const selectedTeam = team({ logo: 'https://cdn.example/team.png' });
    renderWorkspaceRail({
      user: user({ photo: 'https://cdn.example/avatar.png' }),
      teams: [selectedTeam],
    });

    fireEvent.error(screen.getByTestId('workspace-rail-personal-avatar'));
    fireEvent.error(screen.getByTestId(`workspace-rail-team-logo-${selectedTeam.id}`));

    expect(screen.getByTestId('workspace-rail-personal-avatar')).toHaveTextContent('ML');
    expect(screen.getByTestId(`workspace-rail-team-logo-${selectedTeam.id}`)).toHaveTextContent('M');
  });

  it('keeps the generic workspace icon when no connected user exists', () => {
    renderWorkspaceRail({ user: undefined });

    expect(screen.getByRole('button', { name: 'My Workspace' })).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-rail-personal-avatar')).toBeNull();
  });

  it('keeps private team metadata visible and available in the accessible name', () => {
    const privateTeam = team({ visibility: 'private' });
    renderWorkspaceRail({ teams: [privateTeam] });

    const privateTeamButton = screen.getByRole('button', { name: `${privateTeam.name}, private` });
    const lock = privateTeamButton
      .querySelector('[data-private-team-lock="true"]');
    expect(screen.getByText(privateTeam.name)).toBeVisible();
    expect(lock).toBeInTheDocument();
    expect(lock?.parentElement).toHaveClass('opacity-70');
    expect(lock?.parentElement).not.toHaveClass('opacity-0');
  });

  it('does not add private metadata to a public team accessible name', () => {
    const publicTeam = team({ visibility: 'public' });
    renderWorkspaceRail({ teams: [publicTeam] });

    expect(screen.getByRole('button', { name: publicTeam.name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `${publicTeam.name}, private` })).not.toBeInTheDocument();
  });

  it('includes private status in the collapsed team tooltip', async () => {
    const privateTeam = team({ visibility: 'private' });
    renderWorkspaceRail({ collapsed: true, teams: [privateTeam] });

    const privateTeamButton = screen.getByRole('button', { name: `${privateTeam.name}, private` });
    fireEvent.pointerEnter(privateTeamButton, { pointerType: 'mouse' });
    fireEvent.mouseEnter(privateTeamButton);

    expect(await screen.findByText(`${privateTeam.name} · Private · ⌘2`)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Pinned' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pinned teams' })).toBeInTheDocument();
  });

  it('keeps explicitly unpinned teams in More and lets users pin them', () => {
    const pinnedTeam = team({ id: 'team-1', name: 'Pinned Team', path: 'pinned' });
    const moreTeam = team({ id: 'team-2', name: 'More Team', path: 'more' });
    const props = renderWorkspaceRail({
      teams: [pinnedTeam, moreTeam],
      pinnedTeamIds: ['team-1'],
    });

    expect(screen.queryByRole('button', { name: 'More Team' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'More Team' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pin More Team' }));

    expect(props.onPinnedTeamIdsChange).toHaveBeenCalledWith(['team-1', 'team-2']);
  });

  it('automatically opens More when the selected team is unpinned', () => {
    const pinnedTeam = team({ id: 'team-1', name: 'Pinned Team', path: 'pinned' });
    const selectedTeam = team({ id: 'team-2', name: 'Selected Team', path: 'selected' });
    renderWorkspaceRail({
      scope: { type: 'team', label: selectedTeam.name, teamPath: selectedTeam.path },
      teams: [pinnedTeam, selectedTeam],
      pinnedTeamIds: ['team-1'],
    });

    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Selected Team' })).toHaveAttribute('aria-current', 'page');
  });

  it('supports unpinning and exposes keyboard reorder controls', () => {
    const firstTeam = team({ id: 'team-1', name: 'First Team', path: 'first' });
    const secondTeam = team({ id: 'team-2', name: 'Second Team', path: 'second' });
    const props = renderWorkspaceRail({ teams: [firstTeam, secondTeam] });

    expect(screen.getByRole('button', { name: 'Reorder First Team' })).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Unpin First Team' }));
    expect(props.onPinnedTeamIdsChange).toHaveBeenCalledWith(['team-2']);
  });

  it('labels workspace shortcuts and shows position hints only while the primary modifier is held', () => {
    const selectedTeam = team();
    renderWorkspaceRail({ teams: [selectedTeam] });

    expect(screen.getByRole('button', { name: 'My Workspace' })).toHaveAttribute('aria-keyshortcuts', 'Meta+1');
    expect(screen.getByRole('button', { name: selectedTeam.name })).toHaveAttribute('aria-keyshortcuts', 'Meta+2');
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Meta' });
    expect(screen.getByText('1')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    fireEvent.blur(window);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('uses the account footer as the settings entry without showing a Settings label', () => {
    const props = renderWorkspaceRail({
      user: user(),
    });

    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.getByText('Michael Lee')).toBeInTheDocument();
    expect(screen.getByText('@michael')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open settings for Michael Lee' }));

    expect(props.onOpenSettings).toHaveBeenCalledOnce();
  });

  it('shows a compact settings footer when no connected user exists', () => {
    const props = renderWorkspaceRail({
      user: undefined,
    });

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Connect HackMD')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(props.onOpenSettings).toHaveBeenCalledOnce();
  });

  it('shows a quiet loading affordance while the configured account is connecting', () => {
    renderWorkspaceRail({
      user: undefined,
      accountStatus: {
        activeError: null,
        isFetching: true,
        isLoading: true,
        showingCachedFallback: false,
      },
    });

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-rail-account-loading')).toBeInTheDocument();
    expect(screen.queryByText('Connect HackMD')).toBeNull();
  });

  it('marks account sync errors on the settings entry without showing noisy error text', () => {
    const props = renderWorkspaceRail({
      user: undefined,
      accountStatus: {
        activeError: 'HackMD token expired.',
        isFetching: false,
        isLoading: false,
        showingCachedFallback: false,
      },
    });

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-rail-account-attention')).toBeInTheDocument();
    expect(screen.queryByText('HackMD token expired.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open settings. HackMD account needs attention' }));

    expect(props.onOpenSettings).toHaveBeenCalledOnce();
  });

  it('keeps collapsed rail actions accessible by name', () => {
    renderWorkspaceRail({
      collapsed: true,
      user: user(),
    });

    expect(screen.getByRole('button', { name: 'Open local folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open settings for Michael Lee' })).toBeInTheDocument();
  });
});
