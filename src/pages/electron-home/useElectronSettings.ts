import { useQuery } from '@tanstack/react-query';
import { getHackDeskAPI, type HackDeskElectronAPI } from '@/lib/electron-api';

export function useElectronSettings(api?: HackDeskElectronAPI) {
  return useQuery({
    queryKey: ['electron', 'settings'],
    networkMode: 'always',
    queryFn: () => api?.settings.get(),
    enabled: !!api,
  });
}

/** The active HackMD account's id, or null without one (or before settings load). */
export function useActiveHackmdAccountId() {
  return useElectronSettings(getHackDeskAPI() ?? undefined).data?.hackmdAccounts?.activeAccountId ?? null;
}
