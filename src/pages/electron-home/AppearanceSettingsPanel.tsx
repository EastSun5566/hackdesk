import { ThemeAppearanceFields } from '@/components/ThemeAppearanceControls';
import type { ThemeAppearanceDraftController } from '@/components/useThemeAppearanceDraft';

import { SettingsSection } from './SettingsPrimitives';

export function AppearanceSettingsPanel({
  controller,
}: {
  controller: ThemeAppearanceDraftController;
}) {
  return (
    <SettingsSection
      title="Appearance"
      help="Theme changes preview immediately. Apply Theme keeps the preview; Cancel Preview restores the saved theme."
    >
      <ThemeAppearanceFields
        controller={controller}
        density="compact"
        actions="none"
        customSeedsDefaultOpen={false}
      />
    </SettingsSection>
  );
}
