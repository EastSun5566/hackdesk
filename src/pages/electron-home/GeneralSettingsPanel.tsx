import type { AppIconId } from '@/lib/app-icons';

import { AppIconSettings } from './AppIconSettings';
import { SettingsInput, SettingsRow, SettingsSection } from './SettingsPrimitives';
import { SETTINGS_TITLE_ID } from './SettingsDialogConfig';

export function GeneralSettingsPanel({
  title,
  appIcon,
  platform,
  onTitleChange,
  onAppIconChange,
}: {
  title: string;
  appIcon: AppIconId;
  platform: string;
  onTitleChange: (title: string) => void;
  onAppIconChange: (appIcon: AppIconId) => void;
}) {
  return (
    <div className="space-y-6">
      <SettingsSection title="General">
        <SettingsRow label="Window title" htmlFor={SETTINGS_TITLE_ID}>
          <SettingsInput
            id={SETTINGS_TITLE_ID}
            name="window-title"
            autoFocus
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            autoComplete="off"
            spellCheck
          />
        </SettingsRow>
      </SettingsSection>
      <AppIconSettings value={appIcon} platform={platform} onChange={onAppIconChange} />
    </div>
  );
}
