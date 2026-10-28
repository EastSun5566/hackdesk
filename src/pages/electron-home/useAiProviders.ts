import { useEffect, useState } from 'react';

import { onAiSettingsChanged, type AiProviderId } from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';
import type { AppSettings } from '@/lib/settings';

/**
 * The AI providers turned on in Settings › AI, and the one to use: the default when it is on,
 * otherwise the first. Read once, and again whenever Settings › AI saves.
 */
export function useAiProviders() {
  const api = getHackDeskAPI();
  const [state, setState] = useState<{ providers: AiProviderId[]; settings: Partial<AppSettings['ai']> | undefined }>({
    providers: [],
    settings: undefined,
  });
  const [providerId, setProviderId] = useState<AiProviderId | null>(null);

  useEffect(() => {
    if (!api?.ai) return undefined;
    const ai = api.ai;
    let generation = 0;
    const load = () => {
      const current = ++generation;
      void Promise.all([ai.listProviders(), api.settings.get()]).then(([statuses, settings]) => {
        if (current !== generation) return;
        const enabled = statuses.filter(status => status.enabled).map(status => status.id);
        const preferred = settings.ai?.defaultProvider;
        setState({ providers: enabled, settings: settings.ai });
        setProviderId(preferred && enabled.includes(preferred) ? preferred : enabled[0] ?? null);
      }).catch(() => undefined);
    };
    load();
    const unsubscribe = onAiSettingsChanged(load);
    return () => {
      generation += 1;
      unsubscribe();
    };
  }, [api]);

  return { providers: state.providers, settings: state.settings, providerId, setProviderId };
}
