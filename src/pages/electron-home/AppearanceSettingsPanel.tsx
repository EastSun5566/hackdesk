import { ThemeAppearanceFields } from '@/components/ThemeAppearanceControls';
import type { ThemeAppearanceDraftController } from '@/components/useThemeAppearanceDraft';

import { SettingsSection } from './SettingsPrimitives';

export function AppearanceSettingsPanel({
  controller,
}: {
  controller: ThemeAppearanceDraftController;
}) {
  return (
    <SettingsSection title="Appearance" description="Preview and apply a local HackDesk theme.">
      <ThemeAppearanceFields
        controller={controller}
        density="compact"
        actions="none"
        customSeedsDefaultOpen={false}
      />
    </SettingsSection>
  );
}
