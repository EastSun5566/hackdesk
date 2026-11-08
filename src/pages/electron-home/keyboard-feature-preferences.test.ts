import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { holdHintsPreference, leaderSpacePreference } from './keyboard-feature-preferences';

describe('keyboard feature preferences', () => {
  afterEach(() => {
    window.localStorage.removeItem(leaderSpacePreference.key);
    window.localStorage.removeItem(holdHintsPreference.key);
  });

  it('are on by default', () => {
    expect(leaderSpacePreference.read()).toBe(true);
    expect(holdHintsPreference.read()).toBe(true);
  });

  it('switch off independently, telling subscribers', () => {
    const { result } = renderHook(() => [leaderSpacePreference.use(), holdHintsPreference.use()]);
    act(() => leaderSpacePreference.set(false));
    expect(result.current).toEqual([false, true]);
    act(() => holdHintsPreference.set(false));
    expect(result.current).toEqual([false, false]);
  });
});
