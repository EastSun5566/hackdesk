import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkbenchDialogState } from './useWorkbenchDialogState';

describe('useWorkbenchDialogState', () => {
  it('closes the top transient layer before allowing the workbench close policy to continue', () => {
    const { result } = renderHook(() => useWorkbenchDialogState());

    act(() => {
      result.current.setSettingsOpen(true);
      result.current.setPalette({ open: true, search: 'note' });
    });

    act(() => {
      expect(result.current.closeTransientLayer()).toBe(true);
    });

    expect(result.current.palette.open).toBe(false);
    expect(result.current.settingsOpen).toBe(true);

    act(() => {
      expect(result.current.closeTransientLayer()).toBe(true);
    });

    expect(result.current.settingsOpen).toBe(false);

    act(() => {
      expect(result.current.closeTransientLayer()).toBe(false);
    });
  });
});
