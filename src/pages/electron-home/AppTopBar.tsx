import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { COMPACT_ICON_BUTTON_CLASS } from './ui';

function TopBarIconButton({
  children,
  controls,
  expanded,
  label,
  onClick,
}: {
  children: ReactNode;
  controls?: string;
  expanded?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-controls={controls}
      aria-expanded={expanded}
      title={label}
      className={`app-topbar-button ${COMPACT_ICON_BUTTON_CLASS}`}
    >
      {children}
    </button>
  );
}

export function AppTopBar({
  railCollapsed,
  railPanelId,
  onToggleRail,
}: {
  railCollapsed: boolean;
  railPanelId: string;
  onToggleRail: () => void;
}) {
  return (
    <header className="app-topbar flex h-[52px] shrink-0 items-center border-b border-border-default bg-background-default pl-[86px] pr-3">
      <div className="flex items-center gap-1">
        <TopBarIconButton
          controls={railPanelId}
          expanded={!railCollapsed}
          label={railCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          onClick={onToggleRail}
        >
          {railCollapsed ? <PanelLeftOpen aria-hidden="true" className="h-[18px] w-[18px]" /> : <PanelLeftClose aria-hidden="true" className="h-[18px] w-[18px]" />}
        </TopBarIconButton>
      </div>
    </header>
  );
}
