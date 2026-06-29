import type { EditorMode } from '@/lib/settings';

import { SettingsSection } from './SettingsPrimitives';

const EDITOR_MODE_OPTIONS: {
  mode: EditorMode;
  label: string;
  description: string;
}[] = [
  { mode: 'standard', label: 'Standard', description: 'Default CodeMirror keyboard shortcuts.' },
  { mode: 'vim', label: 'Vim', description: 'Vim motions, operators, and command mode.' },
  { mode: 'helix', label: 'Helix', description: 'Selection-first Helix editing and command mode.' },
];

export function EditorSettingsPanel({
  editorMode,
  onEditorModeChange,
}: {
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
}) {
  return (
    <SettingsSection title="Editor" description="Set the keyboard editing model for every open note.">
      <fieldset className="space-y-2">
        <legend className="sr-only">Editor mode</legend>
        {EDITOR_MODE_OPTIONS.map((option) => (
          <label
            key={option.mode}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border-default bg-background-default px-3 py-2.5 text-left hover:bg-element-bg-hover"
          >
            <input
              type="radio"
              name="editor-mode"
              value={option.mode}
              checked={editorMode === option.mode}
              onChange={() => onEditorModeChange(option.mode)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary-default"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text-default">{option.label}</span>
              <span className="mt-0.5 block text-xs text-text-subtle">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </SettingsSection>
  );
}
