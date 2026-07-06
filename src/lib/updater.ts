import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

import { getHackDeskAPI, getRuntimeEnvironment, type CheckForUpdatesResult } from './electron-api';

type CheckForUpdatesCallbacks = {
  onSuccess?: (data: CheckForUpdatesResult, variables: undefined) => void;
  onError?: (error: Error, variables: undefined) => void;
};

export async function checkForUpdatesForRuntime(): Promise<CheckForUpdatesResult> {
  const runtime = getRuntimeEnvironment();

  if (runtime === 'electron') {
    const api = getHackDeskAPI();
    if (!api) {
      throw new Error('Electron update API is unavailable.');
    }

    return api.app.checkForUpdates();
  }

  if (runtime === 'tauri') {
    return invoke<CheckForUpdatesResult>('check_for_updates');
  }

  throw new Error('Update checks are only available in the desktop app.');
}

export function useCheckForUpdates() {
  const [state, setState] = useState<{
    data?: CheckForUpdatesResult;
    error: Error | null;
    isPending: boolean;
    isSuccess: boolean;
  }>({
    data: undefined,
    error: null,
    isPending: false,
    isSuccess: false,
  });

  const mutate = useCallback((_variables?: undefined, callbacks?: CheckForUpdatesCallbacks) => {
    setState({
      data: undefined,
      error: null,
      isPending: true,
      isSuccess: false,
    });

    void checkForUpdatesForRuntime()
      .then((result) => {
        setState({
          data: result,
          error: null,
          isPending: false,
          isSuccess: true,
        });
        callbacks?.onSuccess?.(result, undefined);
      })
      .catch((error: unknown) => {
        const nextError = error instanceof Error ? error : new Error('Failed to check for updates.');
        setState({
          data: undefined,
          error: nextError,
          isPending: false,
          isSuccess: false,
        });
        callbacks?.onError?.(nextError, undefined);
      });
  }, []);

  const reset = useCallback(() => {
    setState({
      data: undefined,
      error: null,
      isPending: false,
      isSuccess: false,
    });
  }, []);

  return {
    ...state,
    mutate,
    reset,
  };
}
