import { Loader2, Save } from 'lucide-react';

import type { ThemeAppearanceDraftController } from '@/components/useThemeAppearanceDraft';
import { cn } from '@/lib/utils';

import type { SettingsTab } from './SettingsDialogConfig';
import { FOCUS_RING_CLASS } from './ui';

export function SettingsDialogFooter({
  activeTab,
  appearanceStatus,
  canSaveTitle,
  isSaving,
  onApplyTheme,
  onCancelPreview,
  onClose,
}: {
  activeTab: SettingsTab;
  appearanceStatus: ThemeAppearanceDraftController['status'];
  canSaveTitle: boolean;
  isSaving: boolean;
  onApplyTheme: () => void;
  onCancelPreview: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-4">
      <div className="flex shrink-0 items-center gap-2">
        {activeTab === 'appearance' && appearanceStatus.hasDraftChanges ? (
          <button
            type="button"
            onClick={onCancelPreview}
            className={cn(
              'inline-flex h-9 items-center rounded-md border border-border-default bg-background-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover',
              FOCUS_RING_CLASS,
            )}
          >
            Cancel Preview
          </button>
        ) : null}
        {activeTab === 'appearance' ? (
          <button
            type="button"
            onClick={onApplyTheme}
            disabled={!appearanceStatus.canApply}
            className={cn(
              'inline-flex h-9 items-center justify-center rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50',
              FOCUS_RING_CLASS,
            )}
          >
            Apply Theme
          </button>
        ) : null}
        {(activeTab === 'general' || activeTab === 'editor' || activeTab === 'hackmd') ? (
          <button
            type="submit"
            aria-label="Save settings"
            title="Save settings"
            disabled={isSaving || !canSaveTitle}
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-md bg-primary-default text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50',
              FOCUS_RING_CLASS,
            )}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>
        ) : null}
        {(activeTab === 'advanced' || activeTab === 'vault') ? (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'inline-flex h-9 items-center rounded-md border border-border-default bg-background-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover',
              FOCUS_RING_CLASS,
            )}
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
