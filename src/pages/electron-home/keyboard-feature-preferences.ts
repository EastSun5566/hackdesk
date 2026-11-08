import { useSyncExternalStore } from 'react';

import { readBooleanStorage, writeBooleanStorage } from './ui-preferences';

/** A keyboard feature someone can switch off on this computer. Both are on by default. */
function createKeyboardFeaturePreference(key: string) {
  const listeners = new Set<() => void>();
  const read = () => readBooleanStorage(key, true);
  const set = (enabled: boolean) => {
    writeBooleanStorage(key, enabled);
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const use = () => useSyncExternalStore(subscribe, read, () => true);
  return { key, read, set, use };
}

/** Space opens the leader menu outside text editing. Its own shortcut (⌘J) is unaffected. */
export const leaderSpacePreference = createKeyboardFeaturePreference('hackdesk_leader_space');

/** Holding ⌘ (Ctrl elsewhere) shows letter hints over what can be reached. */
export const holdHintsPreference = createKeyboardFeaturePreference('hackdesk_hold_hints');
