import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { readStatusLineVisible, setStatusLineVisible, STATUS_LINE_KEY, useStatusLineVisible } from './status-line-preference';

describe('status line preference', () => {
  afterEach(() => window.localStorage.removeItem(STATUS_LINE_KEY));

  it('shows the status line by default', () => {
    expect(readStatusLineVisible()).toBe(true);
  });

  it('hides it, and tells subscribers', () => {
    const { result } = renderHook(() => useStatusLineVisible());
    act(() => setStatusLineVisible(false));
    expect(result.current).toBe(false);
    expect(readStatusLineVisible()).toBe(false);
  });
});
