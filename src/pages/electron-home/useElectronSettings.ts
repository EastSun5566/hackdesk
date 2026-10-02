import { useQuery } from '@tanstack/react-query';
import type { HackDeskElectronAPI } from '@/lib/electron-api';

export function useElectronSettings(api?: HackDeskElectronAPI) {
  return useQuery({
    queryKey: ['electron', 'settings'],
    queryFn: () => api?.settings.get(),
    enabled: !!api,
  });
}
