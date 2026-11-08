import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { TooltipProvider } from '@/components/ui/tooltip';

import { NavigationHintsContext } from './KeyboardNavigationContext';
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

  it('lists the places (My Workspace, History, Local Vault) above the teams, and passes each scope unchanged', async () => {
    const atlas = team();
    const props = renderSwitcher({ teams: [atlas], localVaultConfigured: true });

    const rows = within(await screen.findByRole('dialog', { name: 'Workspaces' })).getAllByRole('button', { name: /^(My Workspace|Atlas Team|Local Vault|History)$/ });
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['My Workspace', 'History', 'Local Vault', 'Atlas Team']);

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
    // The pin appears while its row is hovered or focused.
    fireEvent.focus(within(dialog).getByRole('button', { name: 'Harbor Team' }));
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
    expect(within(dialog).queryByRole('button', { name: 'Unpin Atlas Team' })).toBeNull();
    fireEvent.focus(within(dialog).getByRole('button', { name: 'Atlas Team' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpin Atlas Team' }));
    expect(props.onPinnedTeamIdsChange).toHaveBeenCalledWith(['team-2']);
  });

  it('starts on the current workspace and moves between rows with the arrow keys', async () => {
    renderSwitcher({ scope: { type: 'team', label: 'Atlas Team', teamPath: 'atlas' }, teams: [team()], localVaultConfigured: true });
    const dialog = await screen.findByRole('dialog', { name: 'Workspaces' });
    const row = (name: string) => within(dialog).getByRole('button', { name });

    await waitFor(() => expect(row('Atlas Team')).toHaveFocus());
    fireEvent.keyDown(row('Atlas Team'), { key: 'ArrowDown' });
    expect(row('My Workspace')).toHaveFocus();
    fireEvent.keyDown(row('My Workspace'), { key: 'ArrowDown' });
    expect(row('History')).toHaveFocus();
    fireEvent.keyDown(row('History'), { key: 'ArrowDown' });
    expect(row('Local Vault')).toHaveFocus();
    fireEvent.keyDown(row('Local Vault'), { key: 'ArrowUp' });
    expect(row('History')).toHaveFocus();
  });

  it('finds a team by name when there are many, and opens the first match with Enter', async () => {
    const many = Array.from({ length: 9 }, (_, index) => team({ id: `team-${index}`, name: `Team ${index}`, path: `team-${index}` }));
    const harbor = team({ id: 'harbor', name: 'Harbor Crew', path: 'harbor' });
    const props = renderSwitcher({ teams: [...many, harbor], pinnedTeamIds: ['team-0'] });
    const dialog = await screen.findByRole('dialog', { name: 'Workspaces' });

    const filter = within(dialog).getByRole('textbox', { name: 'Find a team' });
    fireEvent.change(filter, { target: { value: 'harb' } });
    const matches = within(dialog).getByRole('list', { name: 'Matching teams' });
    expect(within(matches).getAllByRole('button', { name: /Crew|Team/ }).map((row) => row.getAttribute('aria-label'))).toEqual(['Harbor Crew']);
    // History and Local Vault stay in reach while filtering.
    expect(within(dialog).getByRole('button', { name: 'History' })).toBeInTheDocument();

    fireEvent.keyDown(filter, { key: 'Enter' });
    expect(props.onScopeChange).toHaveBeenCalledWith({ type: 'team', label: 'Harbor Crew', teamPath: 'harbor' });
  });

  it('keeps the first letter typed on a row, moving it into the team filter', async () => {
    const many = Array.from({ length: 9 }, (_, index) => team({ id: `team-${index}`, name: `Team ${index}`, path: `team-${index}` }));
    renderSwitcher({ teams: many });
    const dialog = await screen.findByRole('dialog', { name: 'Workspaces' });
    const history = within(dialog).getByRole('button', { name: 'History' });
    history.focus();

    fireEvent.keyDown(history, { key: 'h' });
    const filter = within(dialog).getByRole('textbox', { name: 'Find a team' });
    expect(filter).toHaveFocus();
    expect(filter).toHaveValue('h');
  });
});

describe('WorkspaceSwitcher while the primary key is held', () => {
  function renderHeld(open: boolean, held = true) {
    const teams = Array.from({ length: 10 }, (_, index) => team({ id: `team-${index}`, name: `Team ${index}`, path: `team-${index}` }));
    render(
      <TooltipProvider delayDuration={0}>
        <NavigationHintsContext.Provider value={held}>
          <WorkspaceSwitcher
            scope={{ type: 'personal', label: 'My Workspace' }}
            teams={teams}
            localVaultConfigured
            platform="darwin"
            pinnedTeamIds={null}
            switcherOpen={open}
            onSwitcherOpenChange={vi.fn()}
            onScopeChange={vi.fn()}
            onChooseLocalVault={vi.fn()}
            onPinnedTeamIdsChange={vi.fn()}
          />
        </NavigationHintsContext.Provider>
      </TooltipProvider>,
    );
  }

  it('shows which workspace each number opens, up to nine, without taking pointer or reader focus', () => {
    renderHeld(false);
    const peek = document.querySelector<HTMLElement>('[data-workspace-peek]')!;
    expect(peek).toHaveAttribute('aria-hidden', 'true');
    expect(peek).toHaveClass('pointer-events-none');
    const rows = Array.from(peek.querySelectorAll('li')).map(row => row.textContent);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toBe('My Workspace⌘1');
    expect(rows[1]).toBe('TTeam 0⌘2');
    expect(rows[8]).toBe('TTeam 7⌘9');
  });

  it('hides the card when the key is released or the list is open', () => {
    renderHeld(false, false);
    expect(document.querySelector('[data-workspace-peek]')).toBeNull();
    cleanup();
    renderHeld(true);
    expect(document.querySelector('[data-workspace-peek]')).toBeNull();
  });

  it('keeps its focus ring inside the sidebar title', () => {
    renderHeld(false, false);
    expect(screen.getByRole('button', { name: /^Switch workspace, current: / }).className).toContain('focus-visible:ring-inset');
  });
});

describe('SidebarFooter', () => {
  function renderFooter(overrides: Partial<Parameters<typeof SidebarFooter>[0]> = {}) {
    const props = { onOpenSettings: vi.fn(), ...overrides };
    render(<TooltipProvider delayDuration={0}><SidebarFooter {...props} /></TooltipProvider>);
    return props;
  }

  it('keeps the account and Settings as separate buttons', () => {
    const props = renderFooter({ user: user() });

    expect(screen.getByText('Demo Writer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account: Demo Writer' })).toHaveAttribute('title', 'Demo Writer @demo');
    expect(screen.getByTestId('sidebar-footer-avatar')).toHaveTextContent('DW');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
  });

  it('shows a quiet loading dot or an attention mark without the error text', () => {
    renderFooter({ accountStatus: { activeError: null, isFetching: true, isLoading: true, showingCachedFallback: false } });
    expect(screen.getByText('Not signed in')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-account-loading')).toBeInTheDocument();
    cleanup();

    renderFooter({ accountStatus: { activeError: 'HackMD token expired.', isFetching: false, isLoading: false, showingCachedFallback: false } });
    expect(screen.getByTestId('sidebar-account-attention')).toBeInTheDocument();
    expect(screen.queryByText('HackMD token expired.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Account: Not signed in. HackMD account needs attention' })).toBeInTheDocument();
  });
});
