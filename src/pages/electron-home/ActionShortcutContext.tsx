import { createContext, useContext } from 'react';
import { getResolvedActionShortcut } from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';
import type { ShortcutOverrides } from '@/lib/keyboard-shortcuts';

export const ActionShortcutContext = createContext<{ shortcuts?: ShortcutOverrides; platform: string; characterShortcutsEnabled: boolean }>({ platform: 'darwin', characterShortcutsEnabled: true });

export function useActionShortcut(actionId: ElectronActionId) {
  const { shortcuts, platform, characterShortcutsEnabled } = useContext(ActionShortcutContext);
  return getResolvedActionShortcut(actionId, shortcuts, platform, characterShortcutsEnabled);
}

export function ActionMenuShortcut({ actionId }: { actionId: ElectronActionId }) {
  const shortcut = useActionShortcut(actionId);
  return shortcut ? <kbd aria-hidden="true" className="ml-auto pl-4 text-xs text-text-subtle">{shortcut}</kbd> : null;
}
