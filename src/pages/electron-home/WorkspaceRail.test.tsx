import { fireEvent, render, screen } from '@testing-library/react';
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

  it('opens the local vault picker when no vault is configured', () => {
    const props = renderWorkspaceRail({ localVaultConfigured: false });

    fireEvent.click(screen.getByRole('button', { name: 'Local Vault' }));

    expect(props.onChooseLocalVault).toHaveBeenCalledOnce();
    expect(props.onScopeChange).not.toHaveBeenCalled();
  });

  it('switches to local workspace after a vault is configured', () => {
    const props = renderWorkspaceRail({ localVaultConfigured: true });

    fireEvent.click(screen.getByRole('button', { name: 'Local Vault' }));

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

  it('uses the connected user avatar for My Workspace without changing its accessible name', () => {
    renderWorkspaceRail({
      user: user({ photo: 'https://cdn.example/avatar.png' }),
    });

    const personalButton = screen.getByRole('button', { name: 'My Workspace' });
    const avatar = screen.getByTestId('workspace-rail-personal-avatar');

    expect(personalButton).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', 'https://cdn.example/avatar.png');
    expect(avatar).toHaveAttribute('alt', '');
    expect(avatar).toHaveAttribute('loading', 'lazy');
    expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('falls back to user initials when the connected user has no avatar photo', () => {
    renderWorkspaceRail({
      user: user({ name: 'Michael Lee', photo: null }),
    });

    expect(screen.getByTestId('workspace-rail-personal-avatar')).toHaveTextContent('ML');
  });

  it('keeps the generic workspace icon when no connected user exists', () => {
    renderWorkspaceRail({ user: undefined });

    expect(screen.getByRole('button', { name: 'My Workspace' })).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-rail-personal-avatar')).toBeNull();
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

  it('keeps collapsed rail actions accessible by name', () => {
    renderWorkspaceRail({
      collapsed: true,
      user: user(),
    });

    expect(screen.getByRole('button', { name: 'Local Vault' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open settings for Michael Lee' })).toBeInTheDocument();
  });
});
