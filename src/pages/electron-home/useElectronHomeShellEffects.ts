import { useEffect } from 'react';

import type { ElectronActionId, HackDeskElectronAPI } from '@/lib/electron-api';

import {
  FOLDER_EXPANDED_PREFIX,
  writeStringArrayStorage,
} from './ui-preferences';

export type QuickCaptureDraftResult =
  | { accepted: true }
  | { accepted: false; error: string };

export function getQuickCaptureDraftError(input: {
  scopeType: 'history' | 'local' | 'personal' | 'team';
  hasToken: boolean;
  hasConfiguredLocalVault: boolean;
  isLocalVaultReady?: boolean;
}) {
  if (input.scopeType === 'local' && !input.hasConfiguredLocalVault) {
    return 'Choose a local vault before capturing here.';
  }

  if (input.scopeType === 'local' && input.isLocalVaultReady === false) {
    return 'Local Vault is still loading. Your text is still here.';
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
  expandedFolderIds: Set<string>;
  openQuickCaptureDraft: (content: string) => QuickCaptureDraftResult;
  runAction: (actionId: ElectronActionId, options?: { quiet?: boolean }) => unknown;
  /** Where the open folder keeps its expanded folders (see getFolderStateStorageKey). */
  folderStateKey: string | null;
};

export function useElectronHomeShellEffects({
  api,
  expandedFolderIds,
  openQuickCaptureDraft,
  runAction,
  folderStateKey,
}: ElectronHomeShellEffectsOptions) {
  useEffect(() => {
    if (!folderStateKey) return;
    writeStringArrayStorage(`${FOLDER_EXPANDED_PREFIX}${folderStateKey}`, expandedFolderIds);
  }, [expandedFolderIds, folderStateKey]);

  useEffect(() => {
    return api?.app.onCommand((command) => {
      if (command.type === 'quick-capture:create-draft') {
        const result = command.expiresAt > Date.now()
          ? openQuickCaptureDraft(command.content)
          : {
            accepted: false as const,
            error: 'Quick Hack did not reach HackDesk. Your text is still here.',
          };
        void api.app.resolveQuickCaptureSubmission?.({
          requestId: command.requestId,
          ...result,
        });
        return;
      }

      runAction(command.type, { quiet: command.fromShortcut });
    });
  }, [api, openQuickCaptureDraft, runAction]);
}
