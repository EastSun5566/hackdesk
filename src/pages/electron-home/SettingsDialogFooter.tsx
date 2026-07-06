import { Loader2, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ThemeAppearanceDraftController } from '@/components/useThemeAppearanceDraft';

import type { SettingsTab } from './SettingsDialogConfig';

export function SettingsDialogFooter({
  activeTab,
  appearanceStatus,
  canSave,
  isSaving,
  isTestingToken,
  onApplyTheme,
  onCancelPreview,
  onClose,
}: {
  activeTab: SettingsTab;
  appearanceStatus: ThemeAppearanceDraftController['status'];
  canSave: boolean;
  isSaving: boolean;
  isTestingToken: boolean;
  onApplyTheme: () => void;
  onCancelPreview: () => void;
  onClose: () => void;
}) {
  const saveDisabled = isSaving || isTestingToken || !canSave;

  return (
    <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-4">
      <div className="flex shrink-0 items-center gap-2">
        {activeTab === 'appearance' && appearanceStatus.hasDraftChanges ? (
          <Button
            variant="secondary"
            onClick={onCancelPreview}
          >
            Cancel Preview
          </Button>
        ) : null}
        {activeTab === 'appearance' ? (
          <Button
            variant="primary"
            onClick={onApplyTheme}
            disabled={!appearanceStatus.canApply}
          >
            Apply Theme
          </Button>
        ) : null}
        {(activeTab === 'general' || activeTab === 'editor' || activeTab === 'shortcuts' || activeTab === 'hackmd') ? (
          <Button
            variant="primary"
            type="submit"
            disabled={saveDisabled}
          >
            {isSaving || isTestingToken
              ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              : <Save aria-hidden="true" className="h-4 w-4" />}
            {isTestingToken ? 'Testing…' : isSaving ? 'Saving…' : 'Save'}
          </Button>
        ) : null}
        {(activeTab === 'advanced' || activeTab === 'vault') ? (
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Close
          </Button>
        ) : null}
      </div>
    </div>
  );
}
