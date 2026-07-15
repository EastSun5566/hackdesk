import { useEffect } from 'react';

import type { ElectronActionId, HackDeskElectronAPI } from '@/lib/electron-api';

import {
  FOLDER_COLLAPSED_PREFIX,
  writeStringArrayStorage,
} from './ui-preferences';

export type QuickCaptureDraftResult =
  | { accepted: true }
  | { accepted: false; error: string };

export function getQuickCaptureDraftError(input: {
  scopeType: 'history' | 'local' | 'personal' | 'team';
  hasToken: boolean;
  hasConfiguredLocalVault: boolean;
}) {
  if (input.scopeType === 'local' && !input.hasConfiguredLocalVault) {
    return 'Choose a local vault before capturing here.';
  }

  if (input.scopeType === 'history') {
    return 'Choose My Workspace or a team before capturing here.';
  }

  if (!input.hasToken && input.scopeType !== 'local') {
    return 'Connect HackMD in Settings before capturing here.';
  }

  return null;
}

export type ElectronHomeShellEffectsOptions = {
  api?: HackDeskElectronAPI;
  collapsedFolderIds: Set<string>;
  openQuickCaptureDraft: (content: string) => QuickCaptureDraftResult;
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
        const result = command.expiresAt > Date.now()
          ? openQuickCaptureDraft(command.content)
          : {
            accepted: false as const,
            error: 'Quick Capture did not reach HackDesk. Your text is still here.',
          };
        void api.app.resolveQuickCaptureSubmission?.({
          requestId: command.requestId,
          ...result,
        });
        return;
      }

      runAction(command.type);
    });
  }, [api, openQuickCaptureDraft, runAction]);
}
