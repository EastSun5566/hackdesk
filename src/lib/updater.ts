import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

export type CheckForUpdatesResult =
  | { status: 'upToDate' }
  | { status: 'declined'; version: string }
  | { status: 'installed'; version: string; restart_required: boolean };

type CheckForUpdatesCallbacks = {
  onSuccess?: (data: CheckForUpdatesResult, variables: undefined) => void;
  onError?: (error: Error, variables: undefined) => void;
};

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

    void invoke<CheckForUpdatesResult>('check_for_updates')
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
