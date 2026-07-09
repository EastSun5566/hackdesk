import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';

import { getScopeStorageKey } from './repository';
import type { WorkspaceScope } from './types';
import { FOLDER_COLLAPSED_PREFIX, readStringArrayStorage } from './ui-preferences';
import { useElectronHomeShellEffects } from './useElectronHomeShellEffects';

function createApiMock() {
  let commandListener: Parameters<NonNullable<HackDeskElectronAPI['app']['onCommand']>>[0] | null = null;
  const unsubscribe = vi.fn();
  const api = {
    app: {
      onCommand: vi.fn((listener: Parameters<NonNullable<HackDeskElectronAPI['app']['onCommand']>>[0]) => {
        commandListener = listener;
        return unsubscribe;
      }),
    },
  } as unknown as HackDeskElectronAPI;

  return {
    api,
    emitRefreshCommand: () => commandListener?.({ type: 'refresh' }),
    emitQuickCaptureCommand: (content: string) => commandListener?.({ type: 'quick-capture:create-draft', content }),
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
      openQuickCaptureDraft: vi.fn(),
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
      openQuickCaptureDraft: vi.fn(),
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

  it('routes quick capture commands to draft creation instead of action dispatch', () => {
    const { api, emitQuickCaptureCommand } = createApiMock();
    const openQuickCaptureDraft = vi.fn();
    const runAction = vi.fn();
    renderHook(() => useElectronHomeShellEffects({
      api,
      collapsedFolderIds: new Set(),
      openQuickCaptureDraft,
      runAction,
      scopeStorageKey: 'personal',
    }));

    act(() => {
      emitQuickCaptureCommand('# Capture');
    });

    expect(openQuickCaptureDraft).toHaveBeenCalledWith('# Capture');
    expect(runAction).not.toHaveBeenCalled();
  });
});
