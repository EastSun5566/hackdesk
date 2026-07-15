import type { ReactNode } from 'react';
import { ChevronRight, Laptop, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldError, FieldLabel, Input } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectLabelValue, SelectTrigger } from '@/components/ui/select';
import {
  HACKDESK_THEME_PRESETS,
  MAX_EDITOR_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  type ThemeMode,
  type ThemePresetId,
  type ThemeSeed,
} from '@/lib/themes';
import { cn } from '@/lib/utils';
import {
  THEME_SEED_FIELDS,
  useThemeAppearanceDraft,
  type ThemeAppearanceDraftController,
} from '@/components/useThemeAppearanceDraft';

const themeModeOptions: { id: ThemeMode; label: string; description: string; icon: ReactNode }[] = [
  { id: 'light', label: 'Light', description: 'Light mode', icon: <Sun className="h-5 w-5" /> },
  { id: 'dark', label: 'Dark', description: 'Dark mode', icon: <Moon className="h-5 w-5" /> },
  { id: 'system', label: 'System', description: 'Follow system settings', icon: <Laptop className="h-5 w-5" /> },
];

const focusClassName = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default';

type ThemeAppearanceControlsProps = {
  onApplied?: () => void;
  actions?: 'inline' | 'none';
  density?: 'comfortable' | 'compact';
  customSeedsDefaultOpen?: boolean;
  showTypography?: boolean;
};

type ThemeAppearanceFieldsProps = Omit<ThemeAppearanceControlsProps, 'showTypography'> & {
  controller: ThemeAppearanceDraftController;
};

export function ThemeAppearanceControls({
  onApplied,
  actions = 'inline',
  density = 'comfortable',
  customSeedsDefaultOpen = true,
  showTypography = false,
}: ThemeAppearanceControlsProps) {
  const controller = useThemeAppearanceDraft({ showTypography });

  return (
    <ThemeAppearanceFields
      actions={actions}
      controller={controller}
      customSeedsDefaultOpen={customSeedsDefaultOpen}
      density={density}
      onApplied={onApplied}
    />
  );
}

export function ThemeAppearanceFields({
  controller,
  onApplied,
  actions = 'inline',
  density = 'comfortable',
  customSeedsDefaultOpen = true,
}: ThemeAppearanceFieldsProps) {
  const {
    mode: draftMode,
    presetId: draftPresetId,
    seedInputs: draftSeedInputs,
    typography: draftTypography,
  } = controller.draft;
  const { seedErrors: errors, showTypography, status, typographyErrors } = controller;
  const draftActions = controller.actions;
  const presets = HACKDESK_THEME_PRESETS;
  const compact = density === 'compact';

  const handleApply = () => {
    if (draftActions.apply()) {
      onApplied?.();
    }
  };

  return (
    <div className={cn(compact ? 'space-y-4' : 'space-y-6')}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Mode</legend>
        {compact ? null : <p className="mb-3 text-sm text-text-subtle">
          Choose how HackDesk resolves light and dark mode.
        </p>}
        <RadioGroup
          value={draftMode}
          onValueChange={(value) => draftActions.changeMode(value as ThemeMode)}
          className={cn(
            compact
              ? 'inline-flex rounded-md border border-border-default bg-background-muted p-0.5'
              : 'grid grid-cols-1 gap-3 sm:grid-cols-3',
          )}
        >
          {themeModeOptions.map((option) => (
            <RadioGroupItem
              key={option.id}
              value={option.id}
              aria-label={option.label}
              className={cn(
                focusClassName,
                compact
                  ? 'inline-flex h-8 w-auto items-center gap-1.5 rounded border-0 bg-transparent px-2.5 text-xs font-medium transition-colors hover:bg-element-bg-hover'
                  : 'flex h-auto w-auto flex-col items-center gap-2 rounded-lg border-2 p-4 transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:bg-element-bg-hover motion-reduce:transition-none',
                draftMode === option.id && compact ? 'bg-background-default text-text-default shadow-sm' : null,
                draftMode === option.id && !compact ? 'border-primary-default bg-primary-soft' : null,
                draftMode !== option.id && compact ? 'text-text-subtle' : null,
                draftMode !== option.id && !compact ? 'border-border-default bg-background-default hover:border-primary-default hover:bg-element-bg-hover' : null,
              )}
            >
              {compact ? option.icon : (
                <div className={cn(
                  'rounded-full p-2',
                  draftMode === option.id ? 'bg-primary-soft text-primary-default' : 'bg-background-muted text-text-subtle',
                )}>
                  {option.icon}
                </div>
              )}
              <span className={cn(compact ? null : 'text-sm font-medium')}>{option.label}</span>
              {compact ? null : <span className="text-xs text-text-subtle">{option.description}</span>}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Preset</legend>
        {compact ? null : <p className="mb-3 text-sm text-text-subtle">
          Start from a preset, then tune the seed colors below.
        </p>}
        <Select value={draftPresetId} onValueChange={(value) => draftActions.changePreset(value as ThemePresetId)}>
          <SelectTrigger aria-label="Theme preset" className={compact ? 'w-full' : 'max-w-sm'}>
            <SelectLabelValue
              value={draftPresetId}
              labels={Object.fromEntries(presets.map((preset) => [preset.id, preset.name]))}
            />
          </SelectTrigger>
          <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              {preset.name}
            </SelectItem>
          ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-text-subtle">
          {presets.find((preset) => preset.id === draftPresetId)?.description}
        </p>
      </fieldset>

      {showTypography ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Typography</legend>
          {compact ? null : <p className="mb-3 text-sm text-text-subtle">
            Choose local font stacks for HackDesk chrome and the markdown editor.
          </p>}
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
              <ThemeFontField
                label="UI font"
                value={draftTypography.uiFontStack}
                error={typographyErrors.uiFontStack}
                onChange={(value) => draftActions.changeTypography('uiFontStack', value)}
              />
              <ThemeFontSizeField
                label="UI font size"
                value={draftTypography.uiFontSize}
                min={MIN_UI_FONT_SIZE}
                max={MAX_UI_FONT_SIZE}
                error={typographyErrors.uiFontSize}
                onChange={(value) => draftActions.changeTypography('uiFontSize', value)}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
              <ThemeFontField
                label="Editor font"
                value={draftTypography.editorFontStack}
                error={typographyErrors.editorFontStack}
                onChange={(value) => draftActions.changeTypography('editorFontStack', value)}
              />
              <ThemeFontSizeField
                label="Editor font size"
                value={draftTypography.editorFontSize}
                min={MIN_EDITOR_FONT_SIZE}
                max={MAX_EDITOR_FONT_SIZE}
                error={typographyErrors.editorFontSize}
                onChange={(value) => draftActions.changeTypography('editorFontSize', value)}
              />
            </div>
          </div>
        </fieldset>
      ) : null}

      <fieldset className="space-y-2">
        <legend className={compact ? 'sr-only' : 'text-sm font-medium'}>Custom Seeds</legend>
        {compact ? (
          <Collapsible defaultOpen={customSeedsDefaultOpen}>
            <CollapsibleTrigger
              className={cn(
                'flex w-full items-center justify-between rounded-md border border-border-default bg-background-default px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-element-bg-hover',
                focusClassName,
              )}
            >
              <span>Customize Colors</span>
              <ChevronRight className="h-4 w-4 text-text-subtle transition-transform group-data-[panel-open]:rotate-90 motion-reduce:transition-none" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-1 gap-3 pt-2">
                <ThemeSeedFields
                  errors={errors}
                  inputs={draftSeedInputs}
                  onChange={draftActions.changeSeed}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <>
            <p className="mb-3 text-sm text-text-subtle">Leave a seed empty to use the selected preset value.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ThemeSeedFields
                errors={errors}
                inputs={draftSeedInputs}
                onChange={draftActions.changeSeed}
              />
            </div>
          </>
        )}
      </fieldset>

      {actions === 'inline' ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-default pt-4">
          <Button variant="secondary" onClick={draftActions.reset}>
            Reset Theme
          </Button>
          <Button variant="secondary" onClick={draftActions.cancel}>
            Cancel Preview
          </Button>
          <Button variant="primary" onClick={handleApply} disabled={!status.canApply}>
            Apply Theme
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ThemeSeedFields({
  errors,
  inputs,
  onChange,
}: {
  errors: Partial<Record<keyof ThemeSeed, string>>;
  inputs: Record<keyof ThemeSeed, string>;
  onChange: (key: keyof ThemeSeed, value: string) => void;
}) {
  return THEME_SEED_FIELDS.map((field) => {
    const fieldId = `theme-seed-${field.key}`;
    const errorId = `${fieldId}-error`;
    return (
      <Field key={field.key} invalid={Boolean(errors[field.key])}>
        <FieldLabel htmlFor={fieldId}>{field.label}</FieldLabel>
        <div className="flex items-center gap-2">
          <span
            className="size-5 rounded border border-border-default"
            style={{ backgroundColor: inputs[field.key] || 'transparent' }}
            aria-hidden="true"
          />
          <Input
            id={fieldId}
            value={inputs[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
            className="h-9 min-w-0 flex-1 bg-background-default px-2 text-text-default"
            placeholder="#5D54E8…"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={errors[field.key] ? errorId : undefined}
          />
        </div>
        {errors[field.key] ? (
          <FieldError id={errorId} match={Boolean(errors[field.key])}>{errors[field.key]}</FieldError>
        ) : null}
      </Field>
    );
  });
}

function ThemeFontField({
  error,
  label,
  onChange,
  value,
}: {
  error: string | null;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const fieldId = `theme-font-${label.toLowerCase().replace(/\W+/g, '-')}`;
  const errorId = `${fieldId}-error`;

  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 bg-background-default px-2 text-text-default"
        placeholder={label === 'UI font' ? 'Inter, system-ui, sans-serif' : '"Source Code Pro", ui-monospace, monospace'}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <FieldError id={errorId} match={Boolean(error)}>{error}</FieldError> : null}
    </Field>
  );
}

function ThemeFontSizeField({
  error,
  label,
  max,
  min,
  onChange,
  value,
}: {
  error: string | null;
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  value: string;
}) {
  const fieldId = `theme-font-size-${label.toLowerCase().replace(/\W+/g, '-')}`;
  const errorId = `${fieldId}-error`;

  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input
        id={fieldId}
        type="number"
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 bg-background-default px-2 tabular-nums text-text-default"
        autoComplete="off"
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <FieldError id={errorId} match={Boolean(error)}>{error}</FieldError> : null}
    </Field>
  );
}
