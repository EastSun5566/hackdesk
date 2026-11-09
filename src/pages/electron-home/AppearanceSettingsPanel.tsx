import { ThemeAppearanceFields } from '@/components/ThemeAppearanceControls';
import type { ThemeAppearanceDraftController } from '@/components/useThemeAppearanceDraft';

import { SettingsPage, SettingsSection, SettingsSwitchRow } from './SettingsPrimitives';
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
    <SettingsPage>
      <SettingsSection title="Theme" description="Changes preview until you apply or cancel.">
        <ThemeAppearanceFields
          controller={controller}
          density="compact"
          actions="none"
          customSeedsDefaultOpen={false}
          // Each field is a row of the section's card.
          className="settings-card-rows"
        />
      </SettingsSection>
      {/* Take effect at once, unlike the theme above: they change no colours to preview. */}
      <SettingsSection title="Sidebar">
        <SettingsSwitchRow
          id="settings-tree-guides"
          label="Indent guides"
          description="Lines that connect a folder to what it contains."
          checked={showTreeGuides}
          onCheckedChange={setTreeGuides}
        />
      </SettingsSection>
      <SettingsSection title="Window">
        <SettingsSwitchRow
          id="settings-status-line"
          label="Status line"
          description="The line along the bottom of the window, with keys you can press."
          checked={showStatusLine}
          onCheckedChange={setStatusLineVisible}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
