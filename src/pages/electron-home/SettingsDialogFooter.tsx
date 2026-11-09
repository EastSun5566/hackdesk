import { Loader2 } from 'lucide-react';

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
}: {
  activeTab: SettingsTab;
  appearanceStatus: ThemeAppearanceDraftController['status'];
  canSave: boolean;
  isSaving: boolean;
  isTestingToken: boolean;
  onApplyTheme: () => void;
  onCancelPreview: () => void;
}) {
  const saveDisabled = isSaving || isTestingToken || !canSave;
  const saves = activeTab === 'general' || activeTab === 'editor' || activeTab === 'shortcuts' || activeTab === 'hackmd';
  // Pages that apply at once have nothing to save, so no footer: the header's close button closes.
  if (!saves && activeTab !== 'appearance') return null;

  return (
    <div className="scroll-edge-bottom relative flex shrink-0 items-center justify-end gap-2 px-8 py-3">
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
        {saves ? (
          <Button
            variant="primary"
            type="submit"
            disabled={saveDisabled}
          >
            {isSaving || isTestingToken
              ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              : null}
            {isTestingToken ? 'Testing…' : isSaving ? 'Saving…' : 'Save'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
