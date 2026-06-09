import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { COMPACT_ICON_BUTTON_CLASS } from './ui';

function TopBarIconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`app-topbar-button ${COMPACT_ICON_BUTTON_CLASS}`}
    >
      {children}
    </button>
  );
}

export function AppTopBar({
  railCollapsed,
  onToggleRail,
}: {
  railCollapsed: boolean;
  onToggleRail: () => void;
}) {
  return (
    <header className="app-topbar flex h-[52px] shrink-0 items-center border-b border-border-default bg-background-default pl-[86px] pr-3">
      <div className="flex items-center gap-1">
        <TopBarIconButton
          label={railCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          onClick={onToggleRail}
        >
          {railCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </TopBarIconButton>
      </div>
    </header>
  );
}
