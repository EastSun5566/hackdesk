import { useEffect } from 'react';

import type { ElectronActionId, HackDeskElectronAPI } from '@/lib/electron-api';

import {
  FOLDER_COLLAPSED_PREFIX,
  writeStringArrayStorage,
} from './ui-preferences';

export type ElectronHomeShellEffectsOptions = {
  api?: HackDeskElectronAPI;
  collapsedFolderIds: Set<string>;
  openQuickCaptureDraft: (content: string) => void;
  runAction: (actionId: ElectronActionId) => void;
  scopeStorageKey: string;
};

export function useElectronHomeShellEffects({
  api,
  collapsedFolderIds,
  openQuickCaptureDraft,
  runAction,
  scopeStorageKey,
}: ElectronHomeShellEffectsOptions) {
  useEffect(() => {
    writeStringArrayStorage(`${FOLDER_COLLAPSED_PREFIX}${scopeStorageKey}`, collapsedFolderIds);
  }, [collapsedFolderIds, scopeStorageKey]);

  useEffect(() => {
    return api?.app.onCommand((command) => {
      if (command.type === 'quick-capture:create-draft') {
        openQuickCaptureDraft(command.content);
        return;
      }

      runAction(command.type);
    });
  }, [api, openQuickCaptureDraft, runAction]);
}
