import { ThemeAppearanceFields } from '@/components/ThemeAppearanceControls';
import type { ThemeAppearanceDraftController } from '@/components/useThemeAppearanceDraft';

import { SettingsPage, SettingsSection, SettingsSwitchRow } from './SettingsPrimitives';
import { setStatusLineVisible, useStatusLineVisible } from './status-line-preference';
import { setTreeGuides, useTreeGuides } from './tree-guides-preference';

export function AppearanceSettingsPanel({
  controller,
  onRevertTheme,
  onRevertSidebar,
  onRevertWindow,
}: {
  controller: ThemeAppearanceDraftController;
  onRevertTheme: () => void;
  onRevertSidebar: () => void;
  onRevertWindow: () => void;
}) {
  const showTreeGuides = useTreeGuides();
  const showStatusLine = useStatusLineVisible();

  return (
    <SettingsPage>
      <SettingsSection
        title="Theme"
        description="Every change applies at once."
        onRevert={onRevertTheme}
        revertLabel="Reset theme to system mode and the default preset"
      >
        <ThemeAppearanceFields
          controller={controller}
          density="compact"
          customSeedsDefaultOpen={false}
          // Each field is a row of the section's card.
          className="settings-card-rows"
        />
      </SettingsSection>
      {/* Take effect at once, like the theme above. */}
      <SettingsSection title="Sidebar" onRevert={onRevertSidebar} revertLabel="Show indent guides">
        <SettingsSwitchRow
          id="settings-tree-guides"
          label="Indent guides"
          description="Lines that connect a folder to what it contains."
          checked={showTreeGuides}
          onCheckedChange={setTreeGuides}
        />
      </SettingsSection>
      <SettingsSection title="Window" onRevert={onRevertWindow} revertLabel="Show the status line">
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
