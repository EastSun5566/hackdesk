import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  NAVIGATOR_COLLAPSED_KEY,
  NAVIGATOR_WIDTH_KEY,
} from './ui-preferences';
import { useWorkbenchPanelState } from './useWorkbenchPanelState';

describe('useWorkbenchPanelState', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('persists panel collapsed state', () => {
    const { result } = renderHook(() => useWorkbenchPanelState());

    act(() => {
      result.current.toggleNavigatorCollapsed();
    });

    expect(window.localStorage.getItem(NAVIGATOR_COLLAPSED_KEY)).toBe('true');
  });

  it('always starts with Note Details closed and does not remember it open', () => {
    window.localStorage.setItem('hackdesk_inspector_collapsed', 'false');
    const { result } = renderHook(() => useWorkbenchPanelState());
    expect(result.current.inspectorCollapsed).toBe(true);

    act(() => result.current.toggleInspectorCollapsed());

    expect(result.current.inspectorCollapsed).toBe(false);
    expect(window.localStorage.getItem('hackdesk_inspector_collapsed')).toBe('false');
  });

  it('persists the sidebar width', () => {
    const { result } = renderHook(() => useWorkbenchPanelState());

    act(() => {
      result.current.setNavigatorWidth(420);
    });

    expect(result.current.navigatorWidth).toBe(420);
    expect(window.localStorage.getItem(NAVIGATOR_WIDTH_KEY)).toBe('420');
  });

  it.each([
    ['the rail was open', 'false', false],
    ['the rail was never closed', null, false],
    ['the rail was closed too', 'true', true],
  ])('moves a hidden navigator to one sidebar when %s, forgetting the old keys', (_case, rail, collapsed) => {
    window.localStorage.setItem('hackdesk_navigator_collapsed', 'true');
    if (rail !== null) window.localStorage.setItem('hackdesk_rail_collapsed', rail);
    window.localStorage.setItem('hackdesk_rail_width', '240');

    const { result } = renderHook(() => useWorkbenchPanelState());

    expect(result.current.navigatorCollapsed).toBe(collapsed);
    expect(window.localStorage.getItem(NAVIGATOR_COLLAPSED_KEY)).toBe(String(collapsed));
    for (const key of ['hackdesk_navigator_collapsed', 'hackdesk_rail_collapsed', 'hackdesk_rail_width']) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
  });

  it('keeps a sidebar hidden after the move', () => {
    window.localStorage.setItem(NAVIGATOR_COLLAPSED_KEY, 'true');
    window.localStorage.setItem('hackdesk_navigator_collapsed', 'false');

    expect(renderHook(() => useWorkbenchPanelState()).result.current.navigatorCollapsed).toBe(true);
  });
});
