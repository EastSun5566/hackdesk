import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  INSPECTOR_WIDTH_DEFAULT,
  INSPECTOR_WIDTH_KEY,
  INSPECTOR_WIDTH_MAX,
  INSPECTOR_WIDTH_MIN,
  NAVIGATOR_COLLAPSED_KEY,
  NAVIGATOR_WIDTH_DEFAULT,
  NAVIGATOR_WIDTH_KEY,
  NAVIGATOR_WIDTH_MAX,
  NAVIGATOR_WIDTH_MIN,
  readNumberStorage,
  readSidebarCollapsed,
  writeBooleanStorage,
  writeNumberStorage,
} from './ui-preferences';

export type WorkbenchPanelState = {
  inspectorCollapsed: boolean;
  inspectorWidth: number;
  navigatorCollapsed: boolean;
  navigatorWidth: number;
  expandNavigator: () => void;
  isPaneInspectorCollapsed: (paneId: string) => boolean;
  setInspectorWidth: (width: number) => void;
  setNavigatorCollapsed: Dispatch<SetStateAction<boolean>>;
  setNavigatorWidth: (width: number) => void;
  toggleInspectorCollapsed: (paneId?: string) => void;
  toggleNavigatorCollapsed: () => void;
};

const DEFAULT_INSPECTOR_PANE_ID = '__default__';

function writeNavigatorCollapsed(collapsed: boolean) {
  writeBooleanStorage(NAVIGATOR_COLLAPSED_KEY, collapsed);
}

export function useWorkbenchPanelState(): WorkbenchPanelState {
  // Note Details is an overlay over each pane, so every pane always starts closed.
  const [openInspectorPaneIds, setOpenInspectorPaneIds] = useState<ReadonlySet<string>>(() => new Set());
  const [inspectorWidth, setInspectorWidthState] = useState(() => (
    readNumberStorage(INSPECTOR_WIDTH_KEY, INSPECTOR_WIDTH_DEFAULT, INSPECTOR_WIDTH_MIN, INSPECTOR_WIDTH_MAX)
  ));
  const [navigatorCollapsed, setNavigatorCollapsedState] = useState(readSidebarCollapsed);
  const [navigatorWidth, setNavigatorWidthState] = useState(() => (
    readNumberStorage(NAVIGATOR_WIDTH_KEY, NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MIN, NAVIGATOR_WIDTH_MAX)
  ));

  const setNavigatorCollapsed = useCallback<Dispatch<SetStateAction<boolean>>>((value) => {
    setNavigatorCollapsedState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      writeNavigatorCollapsed(next);
      return next;
    });
  }, []);

  const toggleNavigatorCollapsed = useCallback(() => {
    setNavigatorCollapsedState((current) => {
      const next = !current;
      writeNavigatorCollapsed(next);
      return next;
    });
  }, []);

  const isPaneInspectorCollapsed = useCallback(
    (paneId: string) => !openInspectorPaneIds.has(paneId),
    [openInspectorPaneIds],
  );

  const toggleInspectorCollapsed = useCallback((paneId = DEFAULT_INSPECTOR_PANE_ID) => {
    setOpenInspectorPaneIds((current) => {
      const next = new Set(current);
      if (next.has(paneId)) next.delete(paneId);
      else next.add(paneId);
      return next;
    });
  }, []);

  const expandNavigator = useCallback(() => {
    setNavigatorCollapsed(false);
  }, [setNavigatorCollapsed]);

  const setInspectorWidth = useCallback((width: number) => {
    setInspectorWidthState(width);
    writeNumberStorage(INSPECTOR_WIDTH_KEY, width);
  }, []);

  const setNavigatorWidth = useCallback((width: number) => {
    setNavigatorWidthState(width);
    writeNumberStorage(NAVIGATOR_WIDTH_KEY, width);
  }, []);

  return {
    inspectorCollapsed: !openInspectorPaneIds.has(DEFAULT_INSPECTOR_PANE_ID),
    inspectorWidth,
    navigatorCollapsed,
    navigatorWidth,
    expandNavigator,
    isPaneInspectorCollapsed,
    setInspectorWidth,
    setNavigatorCollapsed,
    setNavigatorWidth,
    toggleInspectorCollapsed,
    toggleNavigatorCollapsed,
  };
}
