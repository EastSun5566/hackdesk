import type { AppIconId } from '@/lib/app-icons';
import { defaultSettings } from '@/lib/settings';

import { AppIconSettings } from './AppIconSettings';
import { SettingsInput, SettingsRow, SettingsSection } from './SettingsPrimitives';
import { SETTINGS_TITLE_ID } from './SettingsDialogConfig';

export function GeneralSettingsPanel({
  title,
  titleInvalid,
  appIcon,
  platform,
  onTitleChange,
  onTitleBlur,
  onRevertTitle,
  onAppIconChange,
}: {
  title: string;
  titleInvalid: boolean;
  appIcon: AppIconId;
  platform: string;
  onTitleChange: (title: string) => void;
  onTitleBlur: () => void;
  onRevertTitle: () => void;
  onAppIconChange: (appIcon: AppIconId) => void;
}) {
  return (
    <>
      <SettingsSection title="Window" onRevert={onRevertTitle} revertLabel={`Reset window title to ${defaultSettings.title}`}>
        <SettingsRow
          label="Window title"
          htmlFor={SETTINGS_TITLE_ID}
          description={titleInvalid ? 'Give the window a title; an empty title never saves.' : undefined}
        >
          <SettingsInput
            id={SETTINGS_TITLE_ID}
            name="window-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={onTitleBlur}
            aria-invalid={titleInvalid}
            autoComplete="off"
            spellCheck
          />
        </SettingsRow>
      </SettingsSection>
      <AppIconSettings value={appIcon} platform={platform} onChange={onAppIconChange} />
    </>
  );
}
