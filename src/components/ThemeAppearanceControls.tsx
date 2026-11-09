import type { ReactNode } from 'react';
import { ChevronRight, Laptop, Minus, Moon, Plus, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FontStackPicker } from '@/components/FontStackPicker';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldError, FieldLabel, Input } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectLabelValue, SelectTrigger } from '@/components/ui/select';
import {
  DEFAULT_EDITOR_FONT_STACK,
  DEFAULT_UI_FONT_STACK,
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
  type ThemeAppearanceDraftController,
} from '@/components/useThemeAppearanceDraft';

const themeModeOptions: { id: ThemeMode; label: string; icon: ReactNode }[] = [
  { id: 'light', label: 'Light', icon: <Sun className="h-5 w-5" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="h-5 w-5" /> },
  { id: 'system', label: 'System', icon: <Laptop className="h-5 w-5" /> },
];

const focusClassName = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default';

type ThemeAppearanceFieldsOptions = {
  onApplied?: () => void;
  actions?: 'inline' | 'none';
  density?: 'comfortable' | 'compact';
  customSeedsDefaultOpen?: boolean;
  /** Replaces the default spacing between fields, as when each field is a row of a settings card. */
  className?: string;
};

type ThemeAppearanceFieldsProps = ThemeAppearanceFieldsOptions & {
  controller: ThemeAppearanceDraftController;
};

const LEGEND_CLASS = 'text-sm font-semibold leading-5';
// In a settings card, a field's label matches the card's other row labels. Floated, so it lays out
// as content: a legend otherwise sits in its fieldset's top border, over the card's row rule.
const LEGEND_COMPACT_CLASS = 'float-left mb-2 w-full text-sm font-medium leading-5';
// Typography names a group of labelled fields, so it reads as a quieter overline above them.
const GROUP_LEGEND_COMPACT_CLASS = 'float-left mb-3 w-full text-xs font-semibold uppercase leading-4 tracking-wide text-text-subtle';

export function ThemeAppearanceFields({
  controller,
  onApplied,
  actions = 'inline',
  density = 'comfortable',
  customSeedsDefaultOpen = true,
  className,
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
    <div className={className ?? (compact ? 'space-y-4' : 'space-y-6')}>
      <fieldset className="space-y-2">
        <legend className={compact ? LEGEND_COMPACT_CLASS : LEGEND_CLASS}>Mode</legend>
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
                  ? 'inline-flex h-7 w-auto items-center gap-1.5 rounded border-0 bg-transparent px-2.5 text-sm font-medium transition-colors hover:bg-element-bg-hover'
                  : 'flex h-auto w-auto flex-col items-center gap-2 rounded-lg border-2 p-4 transition duration-150 ease-out hover:bg-element-bg-hover motion-reduce:transition-none',
                draftMode === option.id && compact ? 'bg-background-primary-subtler text-primary-default' : null,
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
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={compact ? LEGEND_COMPACT_CLASS : LEGEND_CLASS}>Preset</legend>
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
      </fieldset>

      {showTypography ? (
        <fieldset className="space-y-3">
          <legend className={compact ? GROUP_LEGEND_COMPACT_CLASS : LEGEND_CLASS}>Typography</legend>
          <div className="clear-both space-y-3">
            <ThemeFontField
              label="UI font"
              value={draftTypography.uiFontStack}
              error={typographyErrors.uiFontStack}
              onChange={(value) => draftActions.changeTypography('uiFontStack', value)}
              size={{
                label: 'UI font size',
                value: draftTypography.uiFontSize,
                min: MIN_UI_FONT_SIZE,
                max: MAX_UI_FONT_SIZE,
                error: typographyErrors.uiFontSize,
                onChange: (value) => draftActions.changeTypography('uiFontSize', value),
              }}
            />
            <ThemeFontField
              label="Editor font"
              value={draftTypography.editorFontStack}
              error={typographyErrors.editorFontStack}
              onChange={(value) => draftActions.changeTypography('editorFontStack', value)}
              size={{
                label: 'Editor font size',
                value: draftTypography.editorFontSize,
                min: MIN_EDITOR_FONT_SIZE,
                max: MAX_EDITOR_FONT_SIZE,
                error: typographyErrors.editorFontSize,
                onChange: (value) => draftActions.changeTypography('editorFontSize', value),
              }}
            />
            <div className="flex items-center justify-between gap-3 pt-1 text-sm">
              <div className="min-w-0">
                <label htmlFor="theme-font-smoothing" className="font-semibold leading-5">Smooth text</label>
                <p className="text-xs leading-5 text-text-subtle">Thinner grayscale text, as in native Mac apps. Off keeps Chromium’s heavier default.</p>
              </div>
              <Switch
                id="theme-font-smoothing"
                checked={draftTypography.fontSmoothing !== 'auto'}
                onCheckedChange={(checked) => draftActions.changeTypography('fontSmoothing', checked ? 'antialiased' : 'auto')}
              />
            </div>
          </div>
        </fieldset>
      ) : null}

      <fieldset className="space-y-2">
        <legend className={compact ? 'sr-only' : 'text-sm font-semibold leading-5'}>Custom Seeds</legend>
        {compact ? (
          <Collapsible defaultOpen={customSeedsDefaultOpen}>
            <CollapsibleTrigger
              className={cn(
                'group -mx-2 flex h-8 items-center gap-1.5 rounded px-2 text-left text-sm font-semibold transition-colors hover:bg-background-hover',
                focusClassName,
              )}
            >
              <ChevronRight className="h-4 w-4 text-icon-default transition-transform duration-150 ease-out group-data-[panel-open]:rotate-90 motion-reduce:transition-none" />
              <span>Customize colors</span>
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
            <p className="mb-3 text-sm text-text-subtle">Empty colors use the preset.</p>
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
            className="size-5 rounded border border-border-default bg-(--swatch)"
            style={{ '--swatch': inputs[field.key] || 'transparent' }}
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

type FontSizeStepperProps = {
  label: string;
  value: string;
  min: number;
  max: number;
  error: string | null;
  onChange: (value: string) => void;
};

/**
 * One face and its size on one row. The size needs no label of its own beside the font it sizes,
 * so it is a compact stepper named for assistive tech only, and nothing can wrap out of line.
 */
function ThemeFontField({
  error,
  label,
  onChange,
  value,
  size,
}: {
  error: string | null;
  label: string;
  onChange: (value: string) => void;
  value: string;
  size: FontSizeStepperProps;
}) {
  const fieldId = `theme-font-${label.toLowerCase().replace(/\W+/g, '-')}`;
  const errorId = `${fieldId}-error`;
  const sizeErrorId = `${fieldId}-size-error`;

  return (
    <Field invalid={Boolean(error || size.error)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <FontStackPicker
            id={fieldId}
            value={value}
            defaultStack={label === 'UI font' ? DEFAULT_UI_FONT_STACK : DEFAULT_EDITOR_FONT_STACK}
            invalid={Boolean(error)}
            describedBy={error ? errorId : undefined}
            onChange={onChange}
          />
        </div>
        <FontSizeStepper {...size} errorId={size.error ? sizeErrorId : undefined} />
      </div>
      {error ? <FieldError id={errorId} match={Boolean(error)}>{error}</FieldError> : null}
      {size.error ? <FieldError id={sizeErrorId} match={Boolean(size.error)}>{size.error}</FieldError> : null}
    </Field>
  );
}

function FontSizeStepper({ label, value, min, max, error, errorId, onChange }: FontSizeStepperProps & { errorId?: string }) {
  const parsed = Number(value);
  const step = (delta: number) => {
    const base = Number.isInteger(parsed) ? parsed : delta > 0 ? min : max;
    onChange(String(Math.min(max, Math.max(min, base + delta))));
  };

  return (
    <div
      className={cn(
        'flex h-8.5 shrink-0 items-center rounded border bg-transparent text-sm text-text-default',
        error ? 'border-destructive-default' : 'border-border-default',
      )}
    >
      <Button type="button" variant="ghost" size="icon" className="h-full w-7 rounded-r-none" aria-label={`Decrease ${label.toLowerCase()}`} disabled={Number.isInteger(parsed) && parsed <= min} onClick={() => step(-1)}>
        <Minus aria-hidden="true" className="size-3.5" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(event) => onChange(event.target.value)}
        className="no-spinner h-full w-9 bg-transparent text-center tabular-nums outline-none focus-visible:bg-background-hover"
        autoComplete="off"
      />
      <Button type="button" variant="ghost" size="icon" className="h-full w-7 rounded-l-none" aria-label={`Increase ${label.toLowerCase()}`} disabled={Number.isInteger(parsed) && parsed >= max} onClick={() => step(1)}>
        <Plus aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}
