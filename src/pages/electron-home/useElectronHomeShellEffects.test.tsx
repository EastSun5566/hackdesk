import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';

import { getScopeStorageKey } from './repository';
import type { WorkspaceScope } from './types';
import { FOLDER_COLLAPSED_PREFIX, readStringArrayStorage } from './ui-preferences';
import { getQuickCaptureDraftError, useElectronHomeShellEffects } from './useElectronHomeShellEffects';

function createApiMock() {
  let commandListener: Parameters<NonNullable<HackDeskElectronAPI['app']['onCommand']>>[0] | null = null;
  const unsubscribe = vi.fn();
  const api = {
    app: {
      onCommand: vi.fn((listener: Parameters<NonNullable<HackDeskElectronAPI['app']['onCommand']>>[0]) => {
        commandListener = listener;
        return unsubscribe;
      }),
      resolveQuickCaptureSubmission: vi.fn(async () => undefined),
    },
  } as unknown as HackDeskElectronAPI;

  return {
    api,
    emitRefreshCommand: () => commandListener?.({ type: 'refresh' }),
    emitQuickCaptureCommand: (content: string, expiresAt = Date.now() + 1000) => commandListener?.({
      type: 'quick-capture:create-draft',
      content,
      requestId: 'capture-request',
      expiresAt,
    }),
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
      openQuickCaptureDraft: vi.fn(() => ({ accepted: true })),
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
      openQuickCaptureDraft: vi.fn(() => ({ accepted: true })),
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

  it('routes quick capture commands to draft creation and acknowledges the result', () => {
    const { api, emitQuickCaptureCommand } = createApiMock();
    const openQuickCaptureDraft = vi.fn(() => ({ accepted: true as const }));
    const runAction = vi.fn();
    renderHook(() => useElectronHomeShellEffects({
      api,
      collapsedFolderIds: new Set(),
      openQuickCaptureDraft,
      runAction,
      scopeStorageKey: 'personal',
    }));

    act(() => {
      emitQuickCaptureCommand('  # Capture\n  Body  ');
    });

    expect(openQuickCaptureDraft).toHaveBeenCalledWith('  # Capture\n  Body  ');
    expect(api.app.resolveQuickCaptureSubmission).toHaveBeenCalledWith({
      requestId: 'capture-request',
      accepted: true,
    });
    expect(runAction).not.toHaveBeenCalled();
  });

  it('rejects expired quick capture commands without creating a draft', () => {
    const { api, emitQuickCaptureCommand } = createApiMock();
    const openQuickCaptureDraft = vi.fn(() => ({ accepted: true as const }));
    renderHook(() => useElectronHomeShellEffects({
      api,
      collapsedFolderIds: new Set(),
      openQuickCaptureDraft,
      runAction: vi.fn(),
      scopeStorageKey: 'personal',
    }));

    act(() => {
      emitQuickCaptureCommand('# Too late', Date.now() - 1);
    });

    expect(openQuickCaptureDraft).not.toHaveBeenCalled();
    expect(api.app.resolveQuickCaptureSubmission).toHaveBeenCalledWith({
      requestId: 'capture-request',
      accepted: false,
      error: 'Quick Capture did not reach HackDesk. Your text is still here.',
    });
  });

  it('returns stable quick capture guard reasons without opening other UI', () => {
    expect(getQuickCaptureDraftError({
      scopeType: 'personal',
      hasToken: false,
      hasConfiguredLocalVault: false,
    })).toBe('Connect HackMD in Settings before capturing here.');
    expect(getQuickCaptureDraftError({
      scopeType: 'local',
      hasToken: false,
      hasConfiguredLocalVault: false,
    })).toBe('Choose a local vault before capturing here.');
    expect(getQuickCaptureDraftError({
      scopeType: 'history',
      hasToken: true,
      hasConfiguredLocalVault: true,
    })).toBe('Choose My Workspace or a team before capturing here.');
    expect(getQuickCaptureDraftError({
      scopeType: 'team',
      hasToken: true,
      hasConfiguredLocalVault: false,
    })).toBeNull();
  });
});
