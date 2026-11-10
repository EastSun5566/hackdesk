import { SettingsInput, SettingsRow, SettingsSection } from './SettingsPrimitives';
import { SETTINGS_TITLE_ID } from './SettingsDialogConfig';
import { defaultSettings } from '@/lib/settings';

export function GeneralSettingsPanel({
  title,
  titleInvalid,
  onTitleChange,
  onTitleBlur,
  onRevertTitle,
}: {
  title: string;
  titleInvalid: boolean;
  onTitleChange: (title: string) => void;
  onTitleBlur: () => void;
  onRevertTitle: () => void;
}) {
  return (
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
  );
}
