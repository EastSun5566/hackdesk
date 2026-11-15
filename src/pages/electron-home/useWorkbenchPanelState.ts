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
  setInspectorWidth: (width: number) => void;
  setNavigatorCollapsed: Dispatch<SetStateAction<boolean>>;
  setNavigatorWidth: (width: number) => void;
  toggleInspectorCollapsed: () => void;
  toggleNavigatorCollapsed: () => void;
};

function writeNavigatorCollapsed(collapsed: boolean) {
  writeBooleanStorage(NAVIGATOR_COLLAPSED_KEY, collapsed);
}

export function useWorkbenchPanelState(): WorkbenchPanelState {
  // Note Details is an overlay over the note, so it always starts closed.
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
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

  const toggleInspectorCollapsed = useCallback(() => {
    setInspectorCollapsed((current) => !current);
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
    inspectorCollapsed,
    inspectorWidth,
    navigatorCollapsed,
    navigatorWidth,
    expandNavigator,
    setInspectorWidth,
    setNavigatorCollapsed,
    setNavigatorWidth,
    toggleInspectorCollapsed,
    toggleNavigatorCollapsed,
  };
}
