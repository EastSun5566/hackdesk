import { invoke } from '@tauri-apps/api/core';
import { useMutation } from '@tanstack/react-query';

export type CheckForUpdatesResult =
  | { status: 'upToDate' }
  | { status: 'declined'; version: string }
  | { status: 'installed'; version: string; restart_required: boolean };

export function useCheckForUpdates() {
  return useMutation({
    mutationFn: async () => invoke<CheckForUpdatesResult>('check_for_updates'),
  });
}
