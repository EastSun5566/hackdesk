import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { TooltipProvider } from '@/components/ui/tooltip';

import { SidebarFooter, WorkspaceSwitcher, type WorkspaceSidebarProps } from './WorkspaceSwitcher';

function user(overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    id: 'user-1',
    email: 'writer@example.com',
    name: 'Demo Writer',
    username: 'demo',
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
    name: 'Atlas Team',
    logo: null,
    path: 'atlas',
    description: null,
    visibility: 'public',
    createdAtMillis: null,
    upgraded: false,
    ...overrides,
  };
}

type SwitcherProps = Omit<WorkspaceSidebarProps, 'switcherOpen' | 'onSwitcherOpenChange'>;

function Harness(props: SwitcherProps & { initiallyOpen: boolean }) {
  const [open, setOpen] = useState(props.initiallyOpen);
  return <WorkspaceSwitcher {...props} switcherOpen={open} onSwitcherOpenChange={setOpen} />;
}

function renderSwitcher(overrides: Partial<SwitcherProps> = {}, initiallyOpen = true) {
  const props: SwitcherProps = {
    scope: { type: 'personal', label: 'My Workspace' },
    user: undefined,
    teams: [],
    localVaultConfigured: false,
    platform: 'darwin',
    pinnedTeamIds: null,
    onChooseLocalVault: vi.fn(),
    onScopeChange: vi.fn(),
    onOpenSettings: vi.fn(),
    onPinnedTeamIdsChange: vi.fn(),
    ...overrides,
  };
  render(
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Harness {...props} initiallyOpen={initiallyOpen} />
    </TooltipProvider>,
  );
  return props;
}

const list = () => screen.getByRole('dialog', { name: 'Workspaces' });

describe('WorkspaceSwitcher', () => {
  it('names the current workspace on its button and opens the list on click', async () => {
    renderSwitcher({ scope: { type: 'team', label: 'Atlas Team', teamPath: 'atlas' }, teams: [team()] }, false);

    const trigger = screen.getByRole('button', { name: 'Switch workspace, current: Atlas Team' });
    expect(trigger).toHaveTextContent('Atlas Team');
    expect(trigger).toHaveAttribute('data-workspace-navigation-id', 'switcher');
    fireEvent.click(trigger);

    expect(await screen.findByRole('dialog', { name: 'Workspaces' })).toBeVisible();
  });

  it('lists My Workspace, pinned teams, then Local Vault and History, and passes each scope unchanged', async () => {
    const atlas = team();
    const props = renderSwitcher({ teams: [atlas], localVaultConfigured: true });

    const rows = within(await screen.findByRole('dialog', { name: 'Workspaces' })).getAllByRole('button', { name: /^(My Workspace|Atlas Team|Local Vault|History)$/ });
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['My Workspace', 'Atlas Team', 'Local Vault', 'History']);

    fireEvent.click(within(list()).getByRole('button', { name: 'Atlas Team' }));
    expect(props.onScopeChange).toHaveBeenCalledWith({ type: 'team', label: atlas.name, teamPath: atlas.path });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Workspaces' })).toBeNull());
  });

  it.each([
    ['My Workspace', { type: 'personal', label: 'My Workspace' }],
    ['Local Vault', { type: 'local', label: 'Local Vault' }],
    ['History', { type: 'history', label: 'History' }],
  ] as const)('switches to %s', async (name, scope) => {
    const props = renderSwitcher({ scope: { type: 'team', label: 'Atlas Team', teamPath: 'atlas' }, teams: [team()], localVaultConfigured: true });
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Workspaces' })).getByRole('button', { name }));
    expect(props.onScopeChange).toHaveBeenCalledWith(scope);
  });

  it('opens the local folder picker when no vault is set up', async () => {
    const props = renderSwitcher();
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Workspaces' })).getByRole('button', { name: 'Open local folder' }));
    expect(props.onChooseLocalVault).toHaveBeenCalledOnce();
    expect(props.onScopeChange).not.toHaveBeenCalled();
  });

  it('marks only the current workspace, and labels the workspace shortcuts', async () => {
    renderSwitcher({ scope: { type: 'history', label: 'History' }, teams: [team()], localVaultConfigured: true });
    const dialog = await screen.findByRole('dialog', { name: 'Workspaces' });

    expect(within(dialog).getByRole('button', { name: 'History' })).toHaveAttribute('aria-current', 'page');
    expect(dialog.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'My Workspace' })).toHaveAttribute('aria-keyshortcuts', 'Meta+1');
    expect(within(dialog).getByRole('button', { name: 'Atlas Team' })).toHaveAttribute('aria-keyshortcuts', 'Meta+2');
    expect(within(dialog).getByText('⌘1')).toBeInTheDocument();
    expect(within(dialog).getByText('⌘2')).toBeInTheDocument();
  });

  it('keeps private teams marked and named as private', async () => {
    renderSwitcher({ teams: [team({ visibility: 'private' }), team({ id: 'team-2', name: 'Harbor Team', path: 'harbor' })] });
    const dialog = await screen.findByRole('dialog', { name: 'Workspaces' });

    expect(within(dialog).getByRole('button', { name: 'Atlas Team, private' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Harbor Team' })).toBeInTheDocument();
    expect(dialog.querySelectorAll('[data-private-team-lock="true"]')).toHaveLength(1);
  });

  it('keeps unpinned teams in More, pins them, and opens More for a selected unpinned team', async () => {
    const pinned = team();
    const more = team({ id: 'team-2', name: 'Harbor Team', path: 'harbor' });
    const props = renderSwitcher({ teams: [pinned, more], pinnedTeamIds: ['team-1'] });
    const dialog = await screen.findByRole('dialog', { name: 'Workspaces' });

    expect(within(dialog).queryByRole('button', { name: 'Harbor Team' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pin Harbor Team' }));
    expect(props.onPinnedTeamIdsChange).toHaveBeenCalledWith(['team-1', 'team-2']);

    cleanup();
    renderSwitcher({ scope: { type: 'team', label: more.name, teamPath: more.path }, teams: [pinned, more], pinnedTeamIds: ['team-1'] });
    const second = await screen.findByRole('dialog', { name: 'Workspaces' });
    expect(within(second).getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(second).getByRole('button', { name: 'Harbor Team' })).toHaveAttribute('aria-current', 'page');
  });

  it('unpins teams and offers a keyboard reorder handle', async () => {
    const props = renderSwitcher({ teams: [team(), team({ id: 'team-2', name: 'Harbor Team', path: 'harbor' })] });
    const dialog = await screen.findByRole('dialog', { name: 'Workspaces' });

    expect(within(dialog).getByRole('button', { name: 'Reorder Atlas Team' })).toHaveAttribute('tabindex', '0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpin Atlas Team' }));
    expect(props.onPinnedTeamIdsChange).toHaveBeenCalledWith(['team-2']);
  });

  it('starts on the current workspace and moves between rows with the arrow keys', async () => {
    renderSwitcher({ scope: { type: 'team', label: 'Atlas Team', teamPath: 'atlas' }, teams: [team()], localVaultConfigured: true });
    const dialog = await screen.findByRole('dialog', { name: 'Workspaces' });
    const row = (name: string) => within(dialog).getByRole('button', { name });

    await waitFor(() => expect(row('Atlas Team')).toHaveFocus());
    fireEvent.keyDown(row('Atlas Team'), { key: 'ArrowDown' });
    expect(row('Local Vault')).toHaveFocus();
    fireEvent.keyDown(row('Local Vault'), { key: 'ArrowDown' });
    fireEvent.keyDown(row('History'), { key: 'ArrowDown' });
    expect(row('My Workspace')).toHaveFocus();
    fireEvent.keyDown(row('My Workspace'), { key: 'ArrowUp' });
    expect(row('History')).toHaveFocus();
  });
});

describe('SidebarFooter', () => {
  function renderFooter(overrides: Partial<Parameters<typeof SidebarFooter>[0]> = {}) {
    const props = { onOpenSettings: vi.fn(), ...overrides };
    render(<TooltipProvider delayDuration={0}><SidebarFooter {...props} /></TooltipProvider>);
    return props;
  }

  it('opens Settings from the account', () => {
    const props = renderFooter({ user: user() });

    expect(screen.getByText('Demo Writer')).toBeInTheDocument();
    expect(screen.getByText('@demo')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-footer-avatar')).toHaveTextContent('DW');
    fireEvent.click(screen.getByRole('button', { name: 'Open settings for Demo Writer' }));
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
  });

  it('shows Trash only with a handler', () => {
    renderFooter();
    expect(screen.queryByRole('button', { name: 'Trash' })).toBeNull();
    cleanup();

    const onOpenTrash = vi.fn();
    renderFooter({ onOpenTrash });
    const trash = within(screen.getByTestId('sidebar-footer')).getByRole('button', { name: 'Trash' });
    expect(trash).toHaveAttribute('data-workspace-navigation-id', 'trash');
    fireEvent.click(trash);
    expect(onOpenTrash).toHaveBeenCalledOnce();
  });

  it('shows Settings, a quiet loading dot, or an attention mark without the error text', () => {
    renderFooter({ accountStatus: { activeError: null, isFetching: true, isLoading: true, showingCachedFallback: false } });
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-account-loading')).toBeInTheDocument();
    cleanup();

    const props = renderFooter({ accountStatus: { activeError: 'HackMD token expired.', isFetching: false, isLoading: false, showingCachedFallback: false } });
    expect(screen.getByTestId('sidebar-account-attention')).toBeInTheDocument();
    expect(screen.queryByText('HackMD token expired.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings. HackMD account needs attention' }));
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
  });
});
