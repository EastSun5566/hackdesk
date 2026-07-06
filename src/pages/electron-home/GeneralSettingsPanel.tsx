import { SettingsInput, SettingsRow, SettingsSection } from './SettingsPrimitives';
import { SETTINGS_TITLE_ID } from './SettingsDialogConfig';

export function GeneralSettingsPanel({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange: (title: string) => void;
}) {
  return (
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
  );
}
