import type { EditorMode } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupIndicator, RadioGroupItem } from '@/components/ui/radio-group';

import { SettingsSection } from './SettingsPrimitives';
import { setNewTabOpens, useNewTabOpens, type NewTabOpens } from './new-tab-preference';

const EDITOR_MODE_OPTIONS: {
  mode: EditorMode;
  label: string;
}[] = [
  { mode: 'standard', label: 'Standard' },
  { mode: 'emacs', label: 'Emacs' },
  { mode: 'vim', label: 'Vim' },
  { mode: 'helix', label: 'Helix' },
  { mode: 'kakoune', label: 'Kakoune (Experimental)' },
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
}: {
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
}) {
  const newTabOpens = useNewTabOpens();

  return (
  <div className="flex flex-col gap-8">
    <SettingsSection page title="Editor">
      <fieldset>
        <legend className="sr-only">Editor mode</legend>
        <RadioGroup
          name="editor-mode"
          value={editorMode}
          onValueChange={(value) => onEditorModeChange(value as EditorMode)}
          className="space-y-2"
        >
        {EDITOR_MODE_OPTIONS.map((option) => (
          <RadioGroupItem
            key={option.mode}
            value={option.mode}
            aria-label={option.label}
            className={cn(
              'group flex h-auto w-full cursor-pointer items-start justify-start gap-3 rounded-md border border-border-default bg-background-default px-3 py-2.5 text-left text-primary-default hover:bg-element-bg-hover',
              editorMode === option.mode && 'border-primary-default/50 bg-primary-soft/40',
            )}
          >
            <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-default bg-background-default text-primary-default group-data-[checked]:border-primary-default">
              <RadioGroupIndicator />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text-default">{option.label}</span>
            </span>
          </RadioGroupItem>
        ))}
        </RadioGroup>
      </fieldset>
    </SettingsSection>

    <SettingsSection title="Tabs">
      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-text-default">New tab opens</legend>
        <RadioGroup
          name="new-tab-opens"
          value={newTabOpens}
          onValueChange={(value) => setNewTabOpens(value as NewTabOpens)}
          className="space-y-2"
        >
          {NEW_TAB_OPTIONS.map((option) => (
            <RadioGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.label}
              className={cn(
                'group flex h-auto w-full cursor-pointer items-start justify-start gap-3 rounded-md border border-border-default bg-background-default px-3 py-2.5 text-left text-primary-default hover:bg-element-bg-hover',
                newTabOpens === option.value && 'border-primary-default/50 bg-primary-soft/40',
              )}
            >
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-default bg-background-default text-primary-default group-data-[checked]:border-primary-default">
                <RadioGroupIndicator />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text-default">{option.label}</span>
                <span className="block text-xs text-text-subtle">{option.description}</span>
              </span>
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </fieldset>
    </SettingsSection>
  </div>
  );
}
