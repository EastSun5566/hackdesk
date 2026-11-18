import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SavedOpenNoteTab } from './note-workspace';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  expectDisabledToolbarAction,
  expectMenuReturnsFocus,
  expectToolbarRovingFocus,
} from '@/test/accessibility-contracts';

import { AppTopBar, ApplicationControls, PaneTabBar, useTrafficLightInset, type PaneTabBarSegment } from './AppTopBar';

function createTab(overrides: Partial<SavedOpenNoteTab> = {}): SavedOpenNoteTab {
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
  const props: Parameters<typeof AppTopBar>[0] = {
    navigation: {
      canGoBack: true,
      canGoForward: true,
      onBack: vi.fn(),
      onForward: vi.fn(),
    },
    navigatorCollapsed: false,
    navigatorPanelId: 'note-navigator-panel',
    onToggleNavigator: vi.fn(),
    trafficLightInset: true,
    ...overrides,
  };

  render(
    <TooltipProvider delayDuration={0}>
      <AppTopBar {...props} />
    </TooltipProvider>,
  );

  return props;
}

function createSegment(overrides: Partial<PaneTabBarSegment> = {}): PaneTabBarSegment {
  const firstTab = createTab();
  const secondTab = createTab({ noteId: 'note-2', shortId: 'short-2', tabId: 'tab-2', title: 'Design Spec' });
  return {
    paneId: 'pane-1',
    isActivePane: true,
    showEqualizeButton: true,
    activeTab: firstTab,
    tabs: [firstTab, secondTab],
    onCloseOtherTabs: vi.fn(),
    onCloseTab: vi.fn(),
    onCloseTabsToRight: vi.fn(),
    onMoveTabToOtherPane: vi.fn(),
    onReorderTab: vi.fn(),
    onSelectTab: vi.fn(),
    onSplitPane: vi.fn(),
    onNewTab: vi.fn(),
    paneLayout: { zoomed: false, onSplitDown: vi.fn(), onToggleZoom: vi.fn(), onEqualize: vi.fn() },
    paneActions: { canMoveToOtherPane: true, canReopenLastClosedTab: true, canSplit: true },
    ...overrides,
  };
}

function renderPaneTabBar(overrides: Partial<Parameters<typeof PaneTabBar>[0]> = {}) {
  const props: Parameters<typeof PaneTabBar>[0] = {
    segment: createSegment(),
    getTabSyncState: vi.fn(() => 'saved' as const),
    onReopenLastClosedTab: vi.fn(),
    isSegmented: false,
    topRow: true,
    ...overrides,
  };
  render(
    <TooltipProvider delayDuration={0}>
      <PaneTabBar {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe('AppTopBar', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('holds only the application controls, clear of the traffic lights', () => {
    renderTopBar();

    const header = screen.getByRole('banner');
    const applicationControls = within(header).getByRole('toolbar', { name: 'Application controls' });
    expect(header).toHaveClass('app-topbar', 'h-10');
    expect(header.firstElementChild).toHaveClass('pl-21.5');
    // Spread across the sidebar: the toggle at the start, the history buttons at the end, no divider.
    expect(applicationControls).toHaveClass('flex-1', 'justify-between');
    expect(within(applicationControls).queryByRole('separator')).not.toBeInTheDocument();
    expect(within(applicationControls).getByRole('group', { name: 'Note history' })).toContainElement(screen.getByRole('button', { name: 'Back' }));
    expect(within(header).queryByRole('navigation', { name: 'Open documents' })).not.toBeInTheDocument();

    const navigatorToggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(navigatorToggle).toHaveClass('app-region-no-drag');
    expect(navigatorToggle).toHaveAttribute('aria-controls', 'note-navigator-panel');
    expect(navigatorToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('app-region-no-drag');
    expect(screen.getByRole('button', { name: 'Forward' })).toHaveClass('app-region-no-drag');
  });

  it('takes no width of its own, so a collapsed sidebar column closes completely', () => {
    renderTopBar();

    expect(screen.getByRole('banner')).toHaveClass('w-0', 'min-w-full', 'overflow-hidden');
  });

  it('leaves its controls to the panes while the sidebar is collapsed', () => {
    renderTopBar({ navigatorCollapsed: true });

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Application controls' })).not.toBeInTheDocument();
  });

  it('only reserves traffic-light space when asked', () => {
    renderTopBar({ trafficLightInset: false });

    const row = screen.getByRole('banner').firstElementChild;
    expect(row).toHaveClass('pl-2');
    expect(row).not.toHaveClass('pl-21.5');
  });

  it('uses roving focus for titlebar application controls', async () => {
    renderTopBar();

    await expectToolbarRovingFocus('Application controls', [
      'Collapse sidebar',
      'Back',
      'Forward',
    ]);
  });

  it('shows action shortcuts in titlebar button tooltips without changing accessible names', async () => {
    renderTopBar();

    const navigatorToggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    fireEvent.focus(navigatorToggle);
    fireEvent.mouseOver(navigatorToggle);

    expect(navigatorToggle).toHaveAccessibleName('Collapse sidebar');
    expect(await screen.findAllByText('⌘B')).not.toHaveLength(0);
  });

  it('runs workbench navigation callbacks from the titlebar', () => {
    const props = renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));

    expect(props.navigation.onBack).toHaveBeenCalledOnce();
    expect(props.navigation.onForward).toHaveBeenCalledOnce();
  });

  it('keeps disabled navigation buttons focusable with stable labels and tooltips', async () => {
    const props = renderTopBar({
      navigation: {
        canGoBack: false,
        canGoForward: false,
        onBack: vi.fn(),
        onForward: vi.fn(),
      },
    });

    const backButton = screen.getByRole('button', { name: 'Back' });
    const forwardButton = screen.getByRole('button', { name: 'Forward' });
    expect(forwardButton).toHaveAttribute('aria-disabled', 'true');

    fireEvent.mouseOver(backButton);
    expectDisabledToolbarAction(backButton, props.navigation.onBack);

    expect(await screen.findByText('No previous note location')).toBeVisible();
  });
});

describe('ApplicationControls', () => {
  it('calls the sidebar toggle', () => {
    const onToggleNavigator = vi.fn();
    render(
      <TooltipProvider delayDuration={0}>
        <ApplicationControls
          navigation={{ canGoBack: false, canGoForward: false, onBack: vi.fn(), onForward: vi.fn() }}
          navigatorCollapsed
          navigatorPanelId="note-navigator-panel"
          onToggleNavigator={onToggleNavigator}
        />
      </TooltipProvider>,
    );

    const navigatorToggle = screen.getByRole('button', { name: 'Expand sidebar' });
    fireEvent.click(navigatorToggle);

    expect(navigatorToggle).toHaveAttribute('aria-expanded', 'false');
    expect(onToggleNavigator).toHaveBeenCalledOnce();
  });
});

describe('PaneTabBar', () => {
  it('is part of the title bar on the top row, and a shorter bar lower down', () => {
    renderPaneTabBar();
    const topBar = document.querySelector<HTMLElement>('[data-pane-tab-bar="pane-1"]');
    expect(topBar).toHaveAttribute('data-pane-tab-bar-row', 'top');
    expect(topBar).toHaveClass('app-topbar', 'h-10');
  });

  it('keeps a lower pane\'s bar out of the window drag region', () => {
    renderPaneTabBar({ topRow: false });
    const innerBar = document.querySelector<HTMLElement>('[data-pane-tab-bar="pane-1"]');
    expect(innerBar).toHaveAttribute('data-pane-tab-bar-row', 'inner');
    expect(innerBar).toHaveClass('h-9');
    expect(innerBar).not.toHaveClass('app-topbar');
  });

  it('keeps tab bar regions in visual keyboard order', () => {
    renderPaneTabBar();

    const bar = document.querySelector<HTMLElement>('[data-pane-tab-bar]')!;
    const openDocuments = within(bar).getByRole('navigation', { name: 'Open documents' });
    const paneControls = within(bar).getByRole('toolbar', { name: 'Pane controls' });
    const regions = Array.from(bar.querySelectorAll<HTMLElement>('[role="toolbar"], nav[aria-label="Open documents"]'));

    expect(regions).toEqual([openDocuments, paneControls]);
    expect(within(openDocuments).getAllByRole('presentation')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /^Product Plan(?:, .+)?$/ })).toHaveClass('app-region-no-drag');
    expect(screen.getByRole('button', { name: 'Close Design Spec' })).toHaveClass('app-region-no-drag');
    expect(screen.getByRole('button', { name: 'Pane actions' })).toHaveClass('app-region-no-drag');
  });

  it('leads with the application controls, clear of the traffic lights, when given them', () => {
    renderPaneTabBar({
      leading: (
        <ApplicationControls
          navigation={{ canGoBack: false, canGoForward: false, onBack: vi.fn(), onForward: vi.fn() }}
          navigatorCollapsed
          navigatorPanelId="note-navigator-panel"
          onToggleNavigator={vi.fn()}
        />
      ),
      trafficLightInset: true,
    });

    const bar = document.querySelector<HTMLElement>('[data-pane-tab-bar]')!;
    expect(bar).toHaveClass('pl-20');
    const regions = Array.from(bar.querySelectorAll<HTMLElement>('[role="toolbar"], nav[aria-label="Open documents"]'));
    expect(regions.map(region => region.getAttribute('aria-label'))).toEqual(['Application controls', 'Open documents', 'Pane controls']);
  });

  it('calls tab select and close callbacks from its tabs', () => {
    const props = renderPaneTabBar();

    fireEvent.click(screen.getByRole('tab', { name: /^Design Spec(?:, .+)?$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Design Spec' }));

    expect(props.segment.onSelectTab).toHaveBeenCalledWith('tab-2');
    expect(props.segment.onCloseTab).toHaveBeenCalledWith('tab-2');
  });

  it('keeps the document navigation quiet when no tabs are open', () => {
    renderPaneTabBar({ segment: createSegment({ activeTab: null, tabs: [] }) });

    expect(screen.getByRole('navigation', { name: 'Open documents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Tab' })).toBeInTheDocument();
  });

  it('runs pane actions from its menu', async () => {
    const props = renderPaneTabBar();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pane actions' }));
    fireEvent.click(await screen.findByText('Split Right'));

    expect(props.segment.onSplitPane).toHaveBeenCalledOnce();
  });

  it('returns focus to the pane toolbar trigger when its menu closes', async () => {
    renderPaneTabBar();

    const trigger = screen.getByRole('button', { name: 'Pane actions' });
    await expectMenuReturnsFocus(trigger, (menu) => {
      fireEvent.keyDown(menu, { key: 'Escape' });
    });
  });

  it('returns focus to the pane toolbar trigger after running a menu action', async () => {
    const props = renderPaneTabBar();

    const trigger = screen.getByRole('button', { name: 'Pane actions' });
    await expectMenuReturnsFocus(trigger, async () => {
      fireEvent.click(await screen.findByText('Split Right'));
    });

    expect(props.segment.onSplitPane).toHaveBeenCalledOnce();
  });

  it('runs its own pane\'s actions, dimming an inactive pane and offering equalize only on the active one', () => {
    const onSelect = vi.fn();
    const onNew = vi.fn();
    const onZoom = vi.fn();
    const tab = createTab({ title: 'Alpha Note' });
    renderPaneTabBar({
      isSegmented: true,
      segment: createSegment({
        isActivePane: false,
        showEqualizeButton: false,
        activeTab: tab,
        tabs: [tab],
        onSelectTab: onSelect,
        onNewTab: onNew,
        paneLayout: { zoomed: false, onSplitDown: vi.fn(), onToggleZoom: onZoom, onEqualize: vi.fn() },
      }),
    });

    const region = document.querySelector<HTMLElement>('[data-hackdesk-focus="tabs"]')!;
    expect(region).toHaveAttribute('data-document-pane-id', 'pane-1');
    expect(region).toHaveAttribute('data-active-tab-segment', 'false');

    fireEvent.click(within(region).getByRole('tab', { name: 'Alpha Note' }));
    fireEvent.click(within(region).getByRole('button', { name: 'New Tab' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Zoom pane' }));
    expect(onSelect).toHaveBeenCalledWith('tab-1');
    expect(onNew).toHaveBeenCalledOnce();
    expect(onZoom).toHaveBeenCalledOnce();
    expect(within(region).queryByRole('button', { name: 'Equalize pane sizes' })).not.toBeInTheDocument();
  });
});

describe('useTrafficLightInset', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('is only on macOS', () => {
    expect(renderHook(() => useTrafficLightInset('darwin')).result.current).toBe(true);
    expect(renderHook(() => useTrafficLightInset('win32')).result.current).toBe(false);
  });

  it('turns off while a macOS window is fullscreen', async () => {
    window.hackdeskAPI = {
      app: {
        getWindowPresentationState: vi.fn(async () => ({ fullScreen: true })),
        onWindowPresentationStateChange: vi.fn(() => vi.fn()),
      },
    } as unknown as NonNullable<typeof window.hackdeskAPI>;
    const { result } = renderHook(() => useTrafficLightInset('darwin'));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
