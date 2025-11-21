import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import { readSettings, writeSettings } from '@/lib/utils';

export const useSettings = () => {
  return useQuery({
    queryKey: ['settings'],
    queryFn: readSettings,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      try {
        JSON.parse(content);
      } catch {
        throw new Error('Invalid JSON format');
      }
      await writeSettings(content);

      return content;
    },
    onSuccess: (content) => {
      queryClient.setQueryData(['settings'], content);
      
      // Apply settings to main window without reload
      invoke('apply_settings').catch((error) => {
        console.error('Failed to apply settings:', error);
      });
    },
  });
};
