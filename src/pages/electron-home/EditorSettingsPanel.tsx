import type { EditorMode } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupIndicator, RadioGroupItem } from '@/components/ui/radio-group';

import { SettingsSection } from './SettingsPrimitives';

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

export function EditorSettingsPanel({
  editorMode,
  onEditorModeChange,
}: {
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
}) {
  return (
    <SettingsSection title="Editor">
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
  );
}
