import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  INSPECTOR_COLLAPSED_KEY,
  NAVIGATOR_COLLAPSED_KEY,
  NAVIGATOR_WIDTH_KEY,
  RAIL_COLLAPSED_KEY,
  RAIL_WIDTH_KEY,
} from './ui-preferences';
import { useWorkbenchPanelState } from './useWorkbenchPanelState';

describe('useWorkbenchPanelState', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('persists panel collapsed state', () => {
    const { result } = renderHook(() => useWorkbenchPanelState());

    act(() => {
      result.current.toggleInspectorCollapsed();
      result.current.toggleRailCollapsed();
      result.current.toggleNavigatorCollapsed();
    });

    expect(window.localStorage.getItem(INSPECTOR_COLLAPSED_KEY)).toBe('false');
    expect(window.localStorage.getItem(RAIL_COLLAPSED_KEY)).toBe('true');
    expect(window.localStorage.getItem(NAVIGATOR_COLLAPSED_KEY)).toBe('true');
  });

  it('persists panel widths and editor search request bumps', () => {
    const { result } = renderHook(() => useWorkbenchPanelState());

    act(() => {
      result.current.setRailWidth(240);
      result.current.setNavigatorWidth(420);
      result.current.bumpEditorSearchRequest();
    });

    expect(result.current.railWidth).toBe(240);
    expect(result.current.navigatorWidth).toBe(420);
    expect(result.current.editorSearchRequestId).toBe(1);
    expect(window.localStorage.getItem(RAIL_WIDTH_KEY)).toBe('240');
    expect(window.localStorage.getItem(NAVIGATOR_WIDTH_KEY)).toBe('420');
  });
});
