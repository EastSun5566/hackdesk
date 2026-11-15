import { ArrowLeft, ArrowRight, Equal, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Toolbar, ToolbarSeparator } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';
import { ToolbarIconButton } from './interaction-primitives';
import type { ElectronActionId } from '@/lib/electron-api';
import { HACK_MODE_DRAG_STRIP_CLASS } from './ui';

function TopBarIconButton({
  actionId,
  children,
  controls,
  expanded,
  pressed,
  label,
  onClick,
  disabled,
  tooltip,
}: {
  actionId: ElectronActionId;
  children: ReactNode;
  controls?: string;
  disabled?: boolean;
  expanded?: boolean;
  pressed?: boolean;
  label: string;
  onClick: () => void;
  tooltip?: ReactNode;
}) {
  return (
    <ToolbarIconButton
      actionId={actionId}
      onClick={onClick}
      aria-controls={controls}
      aria-expanded={expanded}
      aria-pressed={pressed}
      disabled={disabled}
      label={label}
      tooltip={tooltip}
      className="app-topbar-button app-region-no-drag h-7 w-7 rounded-md"
    >
      {children}
    </ToolbarIconButton>
  );
}

export function AppTopBar({
  navigation,
  paneLayout,
  platform,
  navigatorCollapsed,
  navigatorPanelId,
  onToggleNavigator,
}: {
  navigation: {
    canGoBack: boolean;
    canGoForward: boolean;
    onBack: () => void;
    onForward: () => void;
  };
  paneLayout?: {
    paneCount: number;
    zoomed: boolean;
    onToggleZoom: () => void;
    onEqualize: () => void;
  };
  platform: string;
  navigatorCollapsed: boolean;
  navigatorPanelId: string;
  onToggleNavigator: () => void;
}) {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const appApi = window.hackdeskAPI?.app;
    if (platform !== 'darwin'
      || !appApi?.getWindowPresentationState
      || !appApi.onWindowPresentationStateChange) {
      return;
    }

    let active = true;
    let receivedPresentationEvent = false;
    void appApi.getWindowPresentationState().then((state) => {
      if (active && !receivedPresentationEvent) {
        setFullScreen(state.fullScreen);
      }
    });
    const unsubscribe = appApi.onWindowPresentationStateChange((state) => {
      receivedPresentationEvent = true;
      setFullScreen(state.fullScreen);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform]);

  const showMultiPaneControls = Boolean(paneLayout && paneLayout.paneCount > 1);

  return (
    <header className={cn(
      'app-topbar flex h-10 shrink-0 items-center gap-2 pr-2',
      HACK_MODE_DRAG_STRIP_CLASS,
      platform === 'darwin' && !fullScreen ? 'pl-21.5' : 'pl-2',
    )}>
      <Toolbar aria-label="Application controls" className="shrink-0">
        <TopBarIconButton
          actionId="toggle-navigator"
          controls={navigatorPanelId}
          expanded={!navigatorCollapsed}
          label={navigatorCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleNavigator}
        >
          {navigatorCollapsed ? <PanelLeftOpen aria-hidden="true" className="size-4.5" /> : <PanelLeftClose aria-hidden="true" className="size-4.5" />}
        </TopBarIconButton>
        <ToolbarSeparator />
        <TopBarIconButton
          actionId="navigate-back"
          disabled={!navigation.canGoBack}
          label="Back"
          tooltip={navigation.canGoBack ? 'Back' : 'No previous note location'}
          onClick={navigation.onBack}
        >
          <ArrowLeft aria-hidden="true" className="size-4.5" />
        </TopBarIconButton>
        <TopBarIconButton
          actionId="navigate-forward"
          disabled={!navigation.canGoForward}
          label="Forward"
          tooltip={navigation.canGoForward ? 'Forward' : 'No next note location'}
          onClick={navigation.onForward}
        >
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </TopBarIconButton>
      </Toolbar>
      <div aria-hidden="true" className="min-w-0 flex-1" />
      {showMultiPaneControls && paneLayout ? (
        <Toolbar aria-label="Workspace layout controls" className="shrink-0">
          <TopBarIconButton
            actionId="toggle-pane-zoom"
            pressed={paneLayout.zoomed}
            label={paneLayout.zoomed ? 'Restore panes' : 'Zoom pane'}
            onClick={paneLayout.onToggleZoom}
          >
            {paneLayout.zoomed ? <Minimize2 aria-hidden="true" className="size-4" /> : <Maximize2 aria-hidden="true" className="size-4" />}
          </TopBarIconButton>
          <TopBarIconButton
            actionId="equalize-panes"
            label="Equalize pane sizes"
            onClick={paneLayout.onEqualize}
          >
            <Equal aria-hidden="true" className="size-4" />
          </TopBarIconButton>
        </Toolbar>
      ) : null}
    </header>
  );
}
