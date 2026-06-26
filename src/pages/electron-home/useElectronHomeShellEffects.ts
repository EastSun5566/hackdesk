import { useEffect } from 'react';

import type { ElectronActionId, HackDeskElectronAPI } from '@/lib/electron-api';

import {
  FOLDER_COLLAPSED_PREFIX,
  writeStringArrayStorage,
} from './ui-preferences';

export type ElectronHomeShellEffectsOptions = {
  api?: HackDeskElectronAPI;
  collapsedFolderIds: Set<string>;
  runAction: (actionId: ElectronActionId) => void;
  scopeStorageKey: string;
};

export function useElectronHomeShellEffects({
  api,
  collapsedFolderIds,
  runAction,
  scopeStorageKey,
}: ElectronHomeShellEffectsOptions) {
  useEffect(() => {
    writeStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`, collapsedFolderIds);
  }, [collapsedFolderIds, scopeStorageKey]);

  useEffect(() => {
    return api?.app.onCommand((command) => {
      runAction(command.type);
    });
  }, [api, runAction]);
}
