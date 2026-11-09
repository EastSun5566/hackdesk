import { ThemeAppearanceFields } from '@/components/ThemeAppearanceControls';
import { Switch } from '@/components/ui/switch';
import type { ThemeAppearanceDraftController } from '@/components/useThemeAppearanceDraft';

import { SettingsSection } from './SettingsPrimitives';
import { setStatusLineVisible, useStatusLineVisible } from './status-line-preference';
import { setTreeGuides, useTreeGuides } from './tree-guides-preference';

export function AppearanceSettingsPanel({
  controller,
}: {
  controller: ThemeAppearanceDraftController;
}) {
  const showTreeGuides = useTreeGuides();
  const showStatusLine = useStatusLineVisible();

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        page
        title="Appearance"
        help="Changes preview until you apply or cancel."
      >
        <ThemeAppearanceFields
          controller={controller}
          density="compact"
          actions="none"
          customSeedsDefaultOpen={false}
        />
      </SettingsSection>
      {/* Takes effect at once, unlike the theme above: it changes no colours to preview. */}
      <SettingsSection title="Sidebar">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <label htmlFor="settings-tree-guides" className="font-semibold leading-5">Indent guides</label>
            <p className="text-xs leading-5 text-text-subtle">Lines that connect a folder to what it contains.</p>
          </div>
          <Switch id="settings-tree-guides" checked={showTreeGuides} onCheckedChange={setTreeGuides} />
        </div>
      </SettingsSection>
      <SettingsSection title="Window">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <label htmlFor="settings-status-line" className="font-semibold leading-5">Status line</label>
            <p className="text-xs leading-5 text-text-subtle">The line along the bottom of the window, with keys you can press.</p>
          </div>
          <Switch id="settings-status-line" checked={showStatusLine} onCheckedChange={setStatusLineVisible} />
        </div>
      </SettingsSection>
    </div>
  );
}
