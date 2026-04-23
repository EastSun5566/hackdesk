import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import {
  defaultSettings,
  parseSettingsOrDefault,
  serializeSettings,
  validateSettings,
  type AppSettings,
} from '@/lib/settings';
import { readSettings, writeSettings } from '@/lib/utils';

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
