import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  INSPECTOR_COLLAPSED_KEY,
  NAVIGATOR_COLLAPSED_KEY,
  NAVIGATOR_WIDTH_DEFAULT,
  NAVIGATOR_WIDTH_KEY,
  NAVIGATOR_WIDTH_MAX,
  NAVIGATOR_WIDTH_MIN,
  RAIL_COLLAPSED_KEY,
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_KEY,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
  readBooleanStorage,
  readNumberStorage,
  writeBooleanStorage,
  writeNumberStorage,
} from './ui-preferences';

export type WorkbenchPanelState = {
  editorSearchRequestId: number;
  inspectorCollapsed: boolean;
  navigatorCollapsed: boolean;
  navigatorWidth: number;
  railCollapsed: boolean;
  railWidth: number;
  bumpEditorSearchRequest: () => void;
  expandNavigator: () => void;
  setNavigatorCollapsed: Dispatch<SetStateAction<boolean>>;
  setNavigatorWidth: (width: number) => void;
  setRailWidth: (width: number) => void;
  toggleInspectorCollapsed: () => void;
  toggleNavigatorCollapsed: () => void;
  toggleRailCollapsed: () => void;
};

function writeNavigatorCollapsed(collapsed: boolean) {
  writeBooleanStorage(NAVIGATOR_COLLAPSED_KEY, collapsed);
}

export function useWorkbenchPanelState(): WorkbenchPanelState {
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => readBooleanStorage(INSPECTOR_COLLAPSED_KEY, true));
  const [editorSearchRequestId, setEditorSearchRequestId] = useState(0);
  const [railCollapsed, setRailCollapsed] = useState(() => readBooleanStorage(RAIL_COLLAPSED_KEY, false));
  const [navigatorCollapsed, setNavigatorCollapsedState] = useState(() => readBooleanStorage(NAVIGATOR_COLLAPSED_KEY, false));
  const [railWidth, setRailWidthState] = useState(() => (
    readNumberStorage(RAIL_WIDTH_KEY, RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX)
  ));
  const [navigatorWidth, setNavigatorWidthState] = useState(() => (
    readNumberStorage(NAVIGATOR_WIDTH_KEY, NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MIN, NAVIGATOR_WIDTH_MAX)
  ));

  const toggleRailCollapsed = useCallback(() => {
    setRailCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(RAIL_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

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
    setInspectorCollapsed((current) => {
      const next = !current;
      writeBooleanStorage(INSPECTOR_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const expandNavigator = useCallback(() => {
    setNavigatorCollapsed(false);
  }, [setNavigatorCollapsed]);

  const setRailWidth = useCallback((width: number) => {
    setRailWidthState(width);
    writeNumberStorage(RAIL_WIDTH_KEY, width);
  }, []);

  const setNavigatorWidth = useCallback((width: number) => {
    setNavigatorWidthState(width);
    writeNumberStorage(NAVIGATOR_WIDTH_KEY, width);
  }, []);

  const bumpEditorSearchRequest = useCallback(() => {
    setEditorSearchRequestId((current) => current + 1);
  }, []);

  return {
    editorSearchRequestId,
    inspectorCollapsed,
    navigatorCollapsed,
    navigatorWidth,
    railCollapsed,
    railWidth,
    bumpEditorSearchRequest,
    expandNavigator,
    setNavigatorCollapsed,
    setNavigatorWidth,
    setRailWidth,
    toggleInspectorCollapsed,
    toggleNavigatorCollapsed,
    toggleRailCollapsed,
  };
}
