import { defaultSettings, type EditorMode } from '@/lib/settings';

import { SettingsPage, SettingsRadioList, SettingsSection } from './SettingsPrimitives';
import { setNewTabOpens, useNewTabOpens, type NewTabOpens } from './new-tab-preference';

const EDITOR_MODE_OPTIONS: {
  value: EditorMode;
  label: string;
}[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'emacs', label: 'Emacs' },
  { value: 'vim', label: 'Vim' },
  { value: 'helix', label: 'Helix' },
  { value: 'kakoune', label: 'Kakoune (Experimental)' },
];

const NEW_TAB_OPTIONS: {
  value: NewTabOpens;
  label: string;
  description: string;
}[] = [
  { value: 'empty', label: 'Empty page', description: 'Opens a new-tab page you can fill from search or recents.' },
  { value: 'duplicate', label: 'Duplicate current note', description: 'Opens another tab for the note you are viewing.' },
];

export function EditorSettingsPanel({
  editorMode,
  onEditorModeChange,
  onRevertMode,
}: {
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  onRevertMode: () => void;
}) {
  const newTabOpens = useNewTabOpens();

  return (
    <SettingsPage>
      <SettingsSection
        title="Mode"
        description="How keys move and edit in the editor."
        onRevert={onRevertMode}
        revertLabel={`Reset editor mode to ${defaultSettings.editor.mode}`}
      >
        <SettingsRadioList
          name="editor-mode"
          legend="Editor mode"
          value={editorMode}
          options={EDITOR_MODE_OPTIONS}
          onValueChange={onEditorModeChange}
        />
      </SettingsSection>

      <SettingsSection
        title="New tab opens"
        onRevert={() => setNewTabOpens('empty')}
        revertLabel="Reset new tab behavior to open an empty page"
      >
        <SettingsRadioList
          name="new-tab-opens"
          legend="New tab opens"
          value={newTabOpens}
          options={NEW_TAB_OPTIONS}
          onValueChange={setNewTabOpens}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
