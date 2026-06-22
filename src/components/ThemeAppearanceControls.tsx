import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Laptop, Moon, Sun } from 'lucide-react';

import { useTheme } from '@/components/theme-provider';
import { normalizeThemeSeed, type ThemeMode, type ThemePresetId, type ThemeSeed } from '@/lib/themes';
import { cn } from '@/lib/utils';

const themeModeOptions: { id: ThemeMode; label: string; description: string; icon: ReactNode }[] = [
  { id: 'light', label: 'Light', description: 'Light mode', icon: <Sun className="h-5 w-5" /> },
  { id: 'dark', label: 'Dark', description: 'Dark mode', icon: <Moon className="h-5 w-5" /> },
  { id: 'system', label: 'System', description: 'Follow system settings', icon: <Laptop className="h-5 w-5" /> },
];

const seedFields: { key: keyof ThemeSeed; label: string }[] = [
  { key: 'neutral', label: 'Neutral' },
  { key: 'primary', label: 'Primary' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'destructive', label: 'Danger' },
];

const HEX_COLOR_RE = /^#[\da-fA-F]{6}$/;
const DEFAULT_THEME_MODE: ThemeMode = 'system';
const DEFAULT_THEME_PRESET: ThemePresetId = 'hackmd';

function seedToInputs(seed: Partial<ThemeSeed>) {
  return seedFields.reduce<Record<keyof ThemeSeed, string>>((acc, field) => {
    acc[field.key] = seed[field.key] ?? '';
    return acc;
  }, {
    neutral: '',
    primary: '',
    success: '',
    warning: '',
    destructive: '',
  });
}

function inputToSeed(inputs: Record<keyof ThemeSeed, string>) {
  return normalizeThemeSeed(inputs);
}

function getInputErrors(inputs: Record<keyof ThemeSeed, string>) {
  return seedFields.reduce<Partial<Record<keyof ThemeSeed, string>>>((acc, field) => {
    const value = inputs[field.key].trim();
    if (value && !HEX_COLOR_RE.test(value)) {
      acc[field.key] = 'Use a 6-digit hex color, for example #5D54E8.';
    }
    return acc;
  }, {});
}

const focusClassName = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default';
const secondaryButtonClassName = cn(
  'inline-flex h-9 items-center justify-center rounded-md border border-border-default bg-background-default px-3 text-sm font-medium text-text-default transition-colors hover:bg-element-bg-hover',
  focusClassName,
);
const primaryButtonClassName = cn(
  'inline-flex h-9 items-center justify-center rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50',
  focusClassName,
);

export type ThemeAppearanceControlsState = {
  canApply: boolean;
  hasDraftChanges: boolean;
  hasErrors: boolean;
};

export type ThemeAppearanceControlsHandle = {
  apply: () => void;
  cancel: () => void;
  reset: () => void;
};

function seedInputsEqual(left: Record<keyof ThemeSeed, string>, right: Record<keyof ThemeSeed, string>) {
  return seedFields.every((field) => left[field.key] === right[field.key]);
}

export const ThemeAppearanceControls = forwardRef<ThemeAppearanceControlsHandle, {
  onApplied?: () => void;
  actions?: 'inline' | 'none';
  density?: 'comfortable' | 'compact';
  customSeedsDefaultOpen?: boolean;
  onStateChange?: (state: ThemeAppearanceControlsState) => void;
}>(function ThemeAppearanceControls({
  onApplied,
  actions = 'inline',
  density = 'comfortable',
  customSeedsDefaultOpen = true,
  onStateChange,
}, ref) {
  const {
    theme,
    presetId,
    customSeed,
    presets,
    previewTheme,
    cancelPreview,
    setAppearance,
  } = useTheme();
  const [draft, setDraft] = useState(() => ({
    mode: theme,
    presetId,
    seedInputs: seedToInputs(customSeed),
  }));
  const [customSeedsOpen, setCustomSeedsOpen] = useState(customSeedsDefaultOpen);
  const { mode: draftMode, presetId: draftPresetId, seedInputs: draftSeedInputs } = draft;
  const savedSeedInputs = useMemo(() => seedToInputs(customSeed), [customSeed]);
  const errors = useMemo(() => getInputErrors(draftSeedInputs), [draftSeedInputs]);
  const hasErrors = Object.keys(errors).length > 0;
  const hasDraftChanges = draftMode !== theme
    || draftPresetId !== presetId
    || !seedInputsEqual(draftSeedInputs, savedSeedInputs);
  const compact = density === 'compact';

  useEffect(() => {
    setDraft({
      mode: theme,
      presetId,
      seedInputs: seedToInputs(customSeed),
    });
  }, [customSeed, presetId, theme]);

  const preview = (next: {
    mode?: ThemeMode;
    presetId?: ThemePresetId;
    seedInputs?: Record<keyof ThemeSeed, string>;
  }) => {
    const mode = next.mode ?? draftMode;
    const nextPresetId = next.presetId ?? draftPresetId;
    const seedInputs = next.seedInputs ?? draftSeedInputs;
    const nextErrors = getInputErrors(seedInputs);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    previewTheme({
      theme: mode,
      presetId: nextPresetId,
      customSeed: inputToSeed(seedInputs),
    });
  };

  const handleModeChange = (mode: ThemeMode) => {
    setDraft((current) => ({ ...current, mode }));
    preview({ mode });
  };

  const handlePresetChange = (nextPresetId: ThemePresetId) => {
    setDraft((current) => ({ ...current, presetId: nextPresetId }));
    preview({ presetId: nextPresetId });
  };

  const handleSeedChange = (key: keyof ThemeSeed, value: string) => {
    const nextInputs = { ...draftSeedInputs, [key]: value };
    setDraft((current) => ({ ...current, seedInputs: nextInputs }));
    preview({ seedInputs: nextInputs });
  };

  const handleApply = () => {
    if (hasErrors) {
      return;
    }
    setAppearance({
      theme: draftMode,
      presetId: draftPresetId,
      customSeed: inputToSeed(draftSeedInputs),
    });
    onApplied?.();
  };

  const handleCancel = () => {
    cancelPreview();
    setDraft({
      mode: theme,
      presetId,
      seedInputs: seedToInputs(customSeed),
    });
  };

  const handleReset = () => {
    const resetInputs = seedToInputs({});
    setDraft({
      mode: DEFAULT_THEME_MODE,
      presetId: DEFAULT_THEME_PRESET,
      seedInputs: resetInputs,
    });
    previewTheme({
      theme: DEFAULT_THEME_MODE,
      presetId: DEFAULT_THEME_PRESET,
      customSeed: {},
    });
  };

  useImperativeHandle(ref, () => ({
    apply: handleApply,
    cancel: handleCancel,
    reset: handleReset,
  }));

  useEffect(() => {
    onStateChange?.({
      canApply: !hasErrors,
      hasDraftChanges,
      hasErrors,
    });
  }, [hasDraftChanges, hasErrors, onStateChange]);

  return (
    <div className={cn(compact ? 'space-y-4' : 'space-y-6')}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Mode</legend>
        <p className={cn('text-text-subtle', compact ? 'text-xs' : 'mb-3 text-sm')}>
          Choose how HackDesk resolves light and dark mode.
        </p>
        <div className={cn(
          compact
            ? 'inline-flex rounded-md border border-border-default bg-background-muted p-0.5'
            : 'grid grid-cols-1 gap-3 sm:grid-cols-3',
        )}>
          {themeModeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleModeChange(option.id)}
              aria-pressed={draftMode === option.id}
              className={cn(
                focusClassName,
                compact
                  ? 'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors hover:bg-element-bg-hover'
                  : 'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-[background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
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
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Preset</legend>
        <p className={cn('text-text-subtle', compact ? 'text-xs' : 'mb-3 text-sm')}>
          Start from a preset, then tune the seed colors below.
        </p>
        <div className={cn(compact ? 'space-y-2' : 'grid grid-cols-1 gap-3 sm:grid-cols-2')}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetChange(preset.id)}
              aria-pressed={draftPresetId === preset.id}
              className={cn(
                'w-full rounded-lg border bg-background-default text-left transition-[background-color,border-color] duration-150 ease-out hover:bg-element-bg-hover motion-reduce:transition-none',
                focusClassName,
                compact ? 'flex items-center gap-3 p-2.5' : 'border-2 p-3',
                draftPresetId === preset.id ? 'border-primary-default' : 'border-border-default',
              )}
            >
              <span className={cn('flex shrink-0 gap-1', compact ? null : 'mb-3')} aria-hidden="true">
                {seedFields.slice(0, 4).map((field) => (
                  <span
                    key={field.key}
                    className="size-4 rounded-full border border-border-default"
                    style={{ backgroundColor: preset.light[field.key] }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{preset.name}</span>
                <span className="mt-0.5 block truncate text-xs text-text-subtle">{preset.description}</span>
              </span>
              {draftPresetId === preset.id && compact ? (
                <span className="text-xs font-medium text-primary-default">Selected</span>
              ) : null}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={compact ? 'sr-only' : 'text-sm font-medium'}>Custom Seeds</legend>
        {compact ? (
          <button
            type="button"
            aria-expanded={customSeedsOpen}
            aria-controls="theme-custom-seeds"
            onClick={() => setCustomSeedsOpen((current) => !current)}
            className={cn(
              'flex w-full items-center justify-between rounded-md border border-border-default bg-background-default px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-element-bg-hover',
              focusClassName,
            )}
          >
            <span>Customize Colors</span>
            <ChevronRight className={cn(
              'h-4 w-4 text-text-subtle transition-transform motion-reduce:transition-none',
              customSeedsOpen ? 'rotate-90' : null,
            )} />
          </button>
        ) : (
          <p className="mb-3 text-sm text-text-subtle">Leave a seed empty to use the selected preset value.</p>
        )}
        {(!compact || customSeedsOpen) ? (
          <div
            id="theme-custom-seeds"
            className={cn('grid grid-cols-1 gap-3', compact ? null : 'sm:grid-cols-2')}
          >
            {seedFields.map((field) => {
              const fieldId = `theme-seed-${field.key}`;
              const errorId = `${fieldId}-error`;
              return (
                <div key={field.key} className="space-y-2 text-sm">
                  <label htmlFor={fieldId} className="font-medium">{field.label}</label>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-5 rounded border border-border-default"
                      style={{ backgroundColor: draftSeedInputs[field.key] || 'transparent' }}
                      aria-hidden="true"
                    />
                    <input
                      id={fieldId}
                      value={draftSeedInputs[field.key]}
                      onChange={(event) => handleSeedChange(field.key, event.target.value)}
                      className="h-9 min-w-0 flex-1 rounded-md border border-border-default bg-background-default px-2 text-sm text-text-default outline-none transition-[border-color,box-shadow] focus:border-primary-default focus-visible:ring-2 focus-visible:ring-primary-default/70"
                      placeholder="#5D54E8…"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={Boolean(errors[field.key])}
                      aria-describedby={errors[field.key] ? errorId : undefined}
                    />
                  </div>
                  {errors[field.key] ? (
                    <p id={errorId} className="text-xs text-destructive-default">{errors[field.key]}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </fieldset>

      {actions === 'inline' ? (
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-default pt-4">
        <button type="button" onClick={handleReset} className={secondaryButtonClassName}>
          Reset Theme
        </button>
        <button type="button" onClick={handleCancel} className={secondaryButtonClassName}>
          Cancel Preview
        </button>
        <button type="button" onClick={handleApply} disabled={hasErrors} className={primaryButtonClassName}>
          Apply Theme
        </button>
      </div>
      ) : null}
    </div>
  );
});
