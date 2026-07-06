import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';

import { getScopeStorageKey } from './repository';
import type { WorkspaceScope } from './types';
import { FOLDER_COLLAPSED_PREFIX, readStringArrayStorage } from './ui-preferences';
import { useElectronHomeShellEffects } from './useElectronHomeShellEffects';

function createApiMock() {
  let commandListener: ((command: { type: 'refresh' }) => void) | null = null;
  const unsubscribe = vi.fn();
  const api = {
    app: {
      onCommand: vi.fn((listener: (command: { type: 'refresh' }) => void) => {
        commandListener = listener;
        return unsubscribe;
      }),
    },
  } as unknown as HackDeskElectronAPI;

  return {
    api,
    emitRefreshCommand: () => commandListener?.({ type: 'refresh' }),
    unsubscribe,
  };
}

describe('useElectronHomeShellEffects', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('persists collapsed folder ids by scope', () => {
    const scope: WorkspaceScope = { type: 'team', label: 'Design', teamPath: 'design' };
    const scopeStorageKey = getScopeStorageKey(scope);

    renderHook(() => useElectronHomeShellEffects({
      collapsedFolderIds: new Set(['folder-a']),
      runAction: vi.fn(),
      scopeStorageKey,
    }));

    expect(readStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`)).toEqual(new Set(['folder-a']));
  });

  it('subscribes native Electron commands to action dispatch and cleans up', () => {
    const { api, emitRefreshCommand, unsubscribe } = createApiMock();
    const runAction = vi.fn();
    const { unmount } = renderHook(() => useElectronHomeShellEffects({
      api,
      collapsedFolderIds: new Set(),
      runAction,
      scopeStorageKey: 'personal',
    }));

    act(() => {
      emitRefreshCommand();
    });

    expect(runAction).toHaveBeenCalledWith('refresh');

    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
