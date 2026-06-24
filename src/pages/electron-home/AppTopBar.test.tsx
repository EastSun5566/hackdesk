import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { AppTopBar } from './AppTopBar';
import type { OpenNoteTab } from './note-workspace';

function createTab(overrides: Partial<OpenNoteTab> = {}): OpenNoteTab {
  return {
    noteId: 'note-1',
    shortId: 'short-1',
    tabId: 'tab-1',
    teamPath: null,
    title: 'Product Plan',
    updatedAtMillis: null,
    ...overrides,
  };
}

function renderTopBar(overrides: Partial<Parameters<typeof AppTopBar>[0]> = {}) {
  const firstTab = createTab();
  const secondTab = createTab({
    noteId: 'note-2',
    shortId: 'short-2',
    tabId: 'tab-2',
    title: 'Design Spec',
  });
  const props: Parameters<typeof AppTopBar>[0] = {
    activeTab: firstTab,
    canMoveToOtherPane: true,
    canReopenLastClosedTab: true,
    canSplit: true,
    getTabSyncState: vi.fn(() => 'saved'),
    onCloseOtherTabs: vi.fn(),
    onCloseTab: vi.fn(),
    onCloseTabsToRight: vi.fn(),
    onMoveTabToOtherPane: vi.fn(),
    onReopenLastClosedTab: vi.fn(),
    onSelectTab: vi.fn(),
    onSplitPane: vi.fn(),
    navigatorCollapsed: false,
    navigatorPanelId: 'note-navigator-panel',
    railCollapsed: false,
    railPanelId: 'workspace-rail-panel',
    tabs: [firstTab, secondTab],
    onToggleNavigator: vi.fn(),
    onToggleRail: vi.fn(),
    ...overrides,
  };

  render(
    <TooltipProvider delayDuration={0}>
      <AppTopBar {...props} />
    </TooltipProvider>,
  );

  return props;
}

describe('AppTopBar', () => {
  it('renders compact titlebar tabs and sidebar toggles', () => {
    renderTopBar();

    const sidebarToggle = screen.getByRole('button', { name: 'Collapse workspace sidebar' });
    const navigatorToggle = screen.getByRole('button', { name: 'Collapse note navigator' });
    const firstTab = screen.getByRole('button', { name: 'Select Product Plan tab' });

    expect(sidebarToggle).toHaveClass('app-region-no-drag');
    expect(sidebarToggle).toHaveAttribute('aria-controls', 'workspace-rail-panel');
    expect(sidebarToggle).toHaveAttribute('aria-expanded', 'true');
    expect(navigatorToggle).toHaveClass('app-region-no-drag');
    expect(navigatorToggle).toHaveAttribute('aria-controls', 'note-navigator-panel');
    expect(navigatorToggle).toHaveAttribute('aria-expanded', 'true');
    expect(firstTab).toHaveClass('app-region-no-drag');
    expect(firstTab.closest('.app-topbar')).toHaveClass('h-10');
    expect(screen.getByRole('button', { name: 'Select Design Spec tab' })).toBeInTheDocument();
  });

  it('calls the note navigator toggle from the titlebar', () => {
    const props = renderTopBar({
      navigatorCollapsed: true,
    });

    const navigatorToggle = screen.getByRole('button', { name: 'Expand note navigator' });
    fireEvent.click(navigatorToggle);

    expect(navigatorToggle).toHaveClass('app-region-no-drag');
    expect(navigatorToggle).toHaveAttribute('aria-expanded', 'false');
    expect(props.onToggleNavigator).toHaveBeenCalledOnce();
  });

  it('shows action shortcuts in titlebar button tooltips without changing accessible names', async () => {
    renderTopBar();

    const navigatorToggle = screen.getByRole('button', { name: 'Collapse note navigator' });
    fireEvent.focus(navigatorToggle);
    fireEvent.mouseOver(navigatorToggle);

    expect(navigatorToggle).toHaveAccessibleName('Collapse note navigator');
    expect(await screen.findAllByText('⌥⌘B')).not.toHaveLength(0);
  });

  it('calls tab select and close callbacks from titlebar tabs', () => {
    const props = renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'Select Design Spec tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Design Spec' }));

    expect(props.onSelectTab).toHaveBeenCalledWith('tab-2');
    expect(props.onCloseTab).toHaveBeenCalledWith('tab-2');
  });

  it('shows a compact placeholder when no tabs are open', () => {
    renderTopBar({
      activeTab: null,
      tabs: [],
    });

    expect(screen.getByText('No tabs')).toBeInTheDocument();
  });

  it('runs pane actions from the titlebar menu', async () => {
    const props = renderTopBar();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pane actions' }));
    fireEvent.click(await screen.findByText('Split Right'));

    expect(props.onSplitPane).toHaveBeenCalledOnce();
  });
});
