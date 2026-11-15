import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import {
  expectDisabledToolbarAction,
  expectToolbarRovingFocus,
} from '@/test/accessibility-contracts';

import { AppTopBar } from './AppTopBar';

function renderTopBar(overrides: Partial<Parameters<typeof AppTopBar>[0]> = {}) {
  const props: Parameters<typeof AppTopBar>[0] = {
    navigation: {
      canGoBack: true,
      canGoForward: true,
      onBack: vi.fn(),
      onForward: vi.fn(),
    },
    paneLayout: {
      paneCount: 1,
      zoomed: false,
      onToggleZoom: vi.fn(),
      onEqualize: vi.fn(),
    },
    platform: 'darwin',
    navigatorCollapsed: false,
    navigatorPanelId: 'note-navigator-panel',
    onToggleNavigator: vi.fn(),
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
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('renders slim titlebar controls and hides multi-pane layout actions for a single pane', () => {
    renderTopBar();

    const applicationControls = screen.getByRole('toolbar', { name: 'Application controls' });
    const navigatorToggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    const backButton = screen.getByRole('button', { name: 'Back' });
    const forwardButton = screen.getByRole('button', { name: 'Forward' });

    expect(within(applicationControls).getByRole('separator')).toBeInTheDocument();
    expect(navigatorToggle).toHaveClass('app-region-no-drag');
    expect(navigatorToggle).toHaveAttribute('aria-controls', 'note-navigator-panel');
    expect(navigatorToggle).toHaveAttribute('aria-expanded', 'true');
    expect(backButton).toHaveClass('app-region-no-drag');
    expect(forwardButton).toHaveClass('app-region-no-drag');
    expect(screen.getByRole('banner')).toHaveClass('app-topbar', 'h-10', 'pl-21.5');
    expect(screen.queryByRole('toolbar', { name: 'Workspace layout controls' })).not.toBeInTheDocument();
  });

  it('shows multi-pane zoom and equalize buttons when multiple panes are open', () => {
    const props = renderTopBar({
      paneLayout: {
        paneCount: 2,
        zoomed: false,
        onToggleZoom: vi.fn(),
        onEqualize: vi.fn(),
      },
    });

    const layoutControls = screen.getByRole('toolbar', { name: 'Workspace layout controls' });
    const zoomButton = within(layoutControls).getByRole('button', { name: 'Zoom pane' });
    const equalizeButton = within(layoutControls).getByRole('button', { name: 'Equalize pane sizes' });

    expect(zoomButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(zoomButton);
    fireEvent.click(equalizeButton);
    expect(props.paneLayout?.onToggleZoom).toHaveBeenCalledOnce();
    expect(props.paneLayout?.onEqualize).toHaveBeenCalledOnce();
  });

  it('only reserves traffic-light space on macOS', () => {
    renderTopBar({ platform: 'win32' });

    const header = screen.getByRole('banner');
    expect(header).toHaveClass('pl-2');
    expect(header).not.toHaveClass('pl-21.5');
  });

  it('removes traffic-light spacing while a macOS window is fullscreen', async () => {
    window.hackdeskAPI = {
      app: {
        getWindowPresentationState: vi.fn(async () => ({ fullScreen: true })),
        onWindowPresentationStateChange: vi.fn(() => vi.fn()),
      },
    } as unknown as NonNullable<typeof window.hackdeskAPI>;
    renderTopBar();

    await waitFor(() => {
      expect(screen.getByRole('banner')).toHaveClass('pl-2');
    });
    expect(screen.getByRole('banner')).not.toHaveClass('pl-21.5');
  });

  it('uses roving focus for titlebar application controls', async () => {
    renderTopBar();

    await expectToolbarRovingFocus('Application controls', [
      'Collapse sidebar',
      'Back',
      'Forward',
    ]);
  });

  it('calls the sidebar toggle from the titlebar', () => {
    const props = renderTopBar({
      navigatorCollapsed: true,
    });

    const navigatorToggle = screen.getByRole('button', { name: 'Expand sidebar' });
    fireEvent.click(navigatorToggle);

    expect(navigatorToggle).toHaveClass('app-region-no-drag');
    expect(navigatorToggle).toHaveAttribute('aria-expanded', 'false');
    expect(props.onToggleNavigator).toHaveBeenCalledOnce();
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
