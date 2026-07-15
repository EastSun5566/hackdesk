import type { InputHTMLAttributes, ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

import { Input } from '@/components/ui/field';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS } from './ui';

export function SettingsSection({
  title,
  description,
  help,
  children,
}: {
  title: string;
  description?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-balance">{title}</h3>
          {help ? <SettingsHelpTooltip label={title}>{help}</SettingsHelpTooltip> : null}
        </div>
        {description ? <p className="mt-1 text-xs leading-5 text-text-subtle">{description}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

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
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="font-medium">{label}</label>
        {help ? <SettingsHelpTooltip label={label}>{help}</SettingsHelpTooltip> : null}
      </div>
      {description ? <span className="text-xs leading-5 text-text-subtle">{description}</span> : null}
      {children}
    </div>
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
      <button
        type="button"
        aria-label={`About ${label}`}
        className={cn(
          "relative inline-flex size-5 items-center justify-center rounded-full text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default after:absolute after:-inset-2 after:content-['']",
          FOCUS_RING_CLASS,
        )}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
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
    <div className="flex overflow-hidden rounded-md border border-border-default bg-background-muted transition-colors focus-within:border-focus-ring">
      <Input
        className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 focus:border-transparent focus-visible:ring-0"
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        {...props}
      />
      <Toggle
        pressed={visible}
        onPressedChange={onVisibleChange}
        aria-label={visible ? 'Hide token' : 'Show token'}
        className="h-10 rounded-none border-0 border-l border-border-default px-3"
        size="sm"
        variant="ghost"
      >
        {visible ? 'Hide' : 'Show'}
      </Toggle>
    </div>
  );
}
