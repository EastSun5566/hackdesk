import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import { Cmd } from '@/constants';
import {
  defaultSettings,
  parseSettingsOrDefault,
  serializeSettings,
  validateSettings,
  type AgentProviderSettings,
  type AppSettings,
} from '@/lib/settings';
import { readSettings, writeSettings } from '@/lib/utils';

export type AgentProviderValidationResult = {
  provider: AgentProviderSettings['provider'];
  baseUrl: string;
  model: string;
};

function getTauriErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export const useSettings = () => {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => parseSettingsOrDefault(await readSettings(), defaultSettings),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: AppSettings) => {
      const nextSettings = validateSettings(settings);
      await writeSettings(serializeSettings(nextSettings));

      return nextSettings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData<AppSettings>(['settings'], settings);
      queryClient.removeQueries({ queryKey: ['hackmd'] });

      invoke('apply_settings').catch((error) => {
        console.error('Failed to apply settings:', error);
      });
    },
  });
};

export const useValidateAgentProviderConfig = () => {
  return useMutation({
    mutationFn: async (config: AgentProviderSettings) => {
      try {
        return await invoke<AgentProviderValidationResult>(Cmd.VALIDATE_AGENT_PROVIDER_CONFIG, {
          config,
        });
      } catch (error) {
        throw new Error(
          getTauriErrorMessage(error, 'Unable to test the agent provider right now.'),
        );
      }
    },
  });
};
