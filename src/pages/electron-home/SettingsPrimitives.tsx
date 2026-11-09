import type { InputHTMLAttributes, ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { RadioGroup, RadioGroupIndicator, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
/** A settings page's sections. The page's title is the dialog's header, beside the close button. */
export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-7">{children}</div>;
}

/**
 * A titled group of settings: a small heading over a bordered card whose children are its rows
 * (see .settings-card). Rows are ruled off from each other, so they carry no spacing of their own.
 */
export function SettingsSection({
  title,
  description,
  help,
  children,
}: {
  title?: string;
  description?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      {title ? (
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold leading-5 text-text-emphasize text-balance">{title}</h3>
            {help ? <SettingsHelpTooltip label={title}>{help}</SettingsHelpTooltip> : null}
          </div>
          {description ? <p className="text-xs leading-5 text-text-subtle">{description}</p> : null}
        </div>
      ) : null}
      <div className="settings-card">{children}</div>
    </section>
  );
}

/** A labelled control under its label: text fields, selects. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  help,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 text-sm">
      <div>
        <div className="flex items-center gap-1.5">
          <label htmlFor={htmlFor} className="font-medium leading-5">{label}</label>
          {help ? <SettingsHelpTooltip label={label}>{help}</SettingsHelpTooltip> : null}
        </div>
        {description ? <p className="text-xs leading-5 text-text-subtle">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** An on/off setting: its label and description, with the switch at the row's end. */
export function SettingsSwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium leading-5">{label}</label>
        {description ? <p className="text-xs leading-5 text-text-subtle">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** One choice of several, as rows of the section's card with a radio at each row's start. */
export function SettingsRadioList<Value extends string>({
  name,
  legend,
  value,
  options,
  onValueChange,
}: {
  name: string;
  legend: string;
  value: Value;
  options: readonly { value: Value; label: string; description?: string }[];
  onValueChange: (value: Value) => void;
}) {
  return (
    <fieldset data-settings-flush className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <RadioGroup
        name={name}
        value={value}
        onValueChange={next => onValueChange(next as Value)}
        className="flex flex-col"
      >
        {options.map(option => (
          <RadioGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className={cn(
              'group flex h-auto w-full cursor-pointer items-start justify-start gap-3 rounded-none border-0 border-b border-border-subtle last:border-b-0 data-[checked]:border-border-subtle bg-transparent px-4 py-3 text-left transition-colors hover:bg-background-hover first:rounded-t-md last:rounded-b-md focus-visible:ring-inset focus-visible:ring-offset-0',
            )}
          >
            <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border-default bg-background-default text-primary-default group-data-[checked]:border-primary-default">
              <RadioGroupIndicator />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-medium leading-5 text-text-default">{option.label}</span>
              {option.description ? <span className="block text-xs leading-5 text-text-subtle">{option.description}</span> : null}
            </span>
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function SettingsHelpTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip content={children} side="right">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`About ${label}`}
        className="relative after:absolute after:-inset-2"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}

export function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} />;
}

export function SettingsSecretInput({
  visible,
  onVisibleChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded border border-border-default bg-background-muted transition-colors focus-within:border-border-primary-subtler">
      <Input
        className="min-w-0 flex-1 rounded-none border-0 bg-transparent focus:border-transparent focus-visible:ring-0"
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        {...props}
      />
      <Toggle
        pressed={visible}
        onPressedChange={onVisibleChange}
        aria-label={visible ? 'Hide token' : 'Show token'}
        className="rounded-none border-0 border-l border-border-default"
        size="sm"
        variant="ghost"
      >
        {visible ? 'Hide' : 'Show'}
      </Toggle>
    </div>
  );
}
