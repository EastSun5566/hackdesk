import type { InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS, TEXT_INPUT_CLASS } from './ui';

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
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
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 text-sm">
      <label htmlFor={htmlFor} className="font-medium">{label}</label>
      {description ? <span className="text-xs leading-5 text-text-subtle">{description}</span> : null}
      {children}
    </div>
  );
}

export function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={TEXT_INPUT_CLASS} {...props} />;
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
      <input
        className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        onClick={() => onVisibleChange(!visible)}
        className={cn(
          'border-l border-border-default px-3 text-xs font-medium text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default',
          FOCUS_RING_CLASS,
        )}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
