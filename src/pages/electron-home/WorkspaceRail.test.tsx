import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TeamSummary, UserSummary } from '@/lib/electron-api';

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
    width: 72,
    onChooseLocalVault: vi.fn(),
    onScopeChange: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };

  render(<WorkspaceRail {...props} />);
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
  });

  it('orders remote workspaces before fixed local and account utilities', () => {
    const selectedTeam = team();
    renderWorkspaceRail({ teams: [selectedTeam] });

    const rail = screen.getByRole('complementary', { name: 'Workspace switcher' });
    expect(within(rail).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'My Workspace',
      'History',
      selectedTeam.name,
      'Open local folder',
      'Open settings',
    ]);

    const teamList = screen.getByTestId('workspace-rail-team-list');
    const utilities = screen.getByTestId('workspace-rail-utilities');
    expect(teamList).toContainElement(screen.getByRole('button', { name: selectedTeam.name }));
    expect(teamList).not.toContainElement(screen.getByRole('button', { name: 'Open local folder' }));
    expect(utilities).toContainElement(screen.getByRole('button', { name: 'Open local folder' }));
    expect(utilities).toContainElement(screen.getByRole('button', { name: 'Open settings' }));
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

  it('keeps private team metadata visible without hover', () => {
    const privateTeam = team({ visibility: 'private' });
    renderWorkspaceRail({ teams: [privateTeam] });

    const lock = screen.getByRole('button', { name: privateTeam.name })
      .querySelector('[data-private-team-lock="true"]');
    expect(lock).toBeInTheDocument();
    expect(lock?.parentElement).toHaveClass('opacity-70');
    expect(lock?.parentElement).not.toHaveClass('opacity-0');
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
