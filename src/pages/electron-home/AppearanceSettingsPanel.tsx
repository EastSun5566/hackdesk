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
  );
}
