import type { EditorMode } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupIndicator, RadioGroupItem } from '@/components/ui/radio-group';

import { SettingsSection } from './SettingsPrimitives';

const EDITOR_MODE_OPTIONS: {
  mode: EditorMode;
  label: string;
  description: string;
}[] = [
  { mode: 'standard', label: 'Standard', description: 'Default CodeMirror keyboard shortcuts.' },
  { mode: 'emacs', label: 'Emacs', description: 'Emacs navigation, mark, kill-ring, and key chords.' },
  { mode: 'vim', label: 'Vim', description: 'Vim motions, operators, and command mode.' },
  { mode: 'helix', label: 'Helix', description: 'Selection-first Helix editing and command mode.' },
  { mode: 'kakoune', label: 'Kakoune (Experimental)', description: 'Selection-first Kakoune editing with a focused core keymap.' },
];

export function EditorSettingsPanel({
  editorMode,
  onEditorModeChange,
  fadeWhileTyping,
  onFadeWhileTypingChange,
}: {
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  fadeWhileTyping: boolean;
  onFadeWhileTypingChange: (fade: boolean) => void;
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
            aria-label={`${option.label}: ${option.description}`}
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
              <span className="mt-0.5 block text-xs text-text-subtle">{option.description}</span>
            </span>
          </RadioGroupItem>
        ))}
        </RadioGroup>
      </fieldset>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={fadeWhileTyping} onChange={event => onFadeWhileTypingChange(event.target.checked)} />
        Fade the workbench while typing
      </label>
      <p className="ml-6 mt-1 text-xs text-text-subtle">The sidebar, tabs and key hints come back when you move the pointer or press a modifier key.</p>
    </SettingsSection>
  );
}
