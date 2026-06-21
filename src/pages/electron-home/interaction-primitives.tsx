import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import type {
  ButtonHTMLAttributes,
  Ref,
  ReactNode,
} from 'react';
import { forwardRef, useId, useState } from 'react';

import {
  COLLAPSE_ICON_CLASS,
  FOCUS_RING_CLASS,
  ICON_BUTTON_CLASS,
  PANEL_TRANSITION_CLASS,
} from './ui';
import { DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';

type EntityRowVariant = 'default' | 'compact';

type EntityRowProps = {
  leadingControls?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  trailing?: ReactNode;
  menu?: ReactNode;
  contextMenu?: ReactNode;
  selected?: boolean;
  active?: boolean;
  disabled?: boolean;
  variant?: EntityRowVariant;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  trailingClassName?: string;
  onClick?: () => void;
  ariaLabel?: string;
  titleAttribute?: string;
};

function entityRowClassName({
  selected,
  active,
  disabled,
  variant,
  clickable,
  className,
}: {
  selected?: boolean;
  active?: boolean;
  disabled?: boolean;
  variant: EntityRowVariant;
  clickable: boolean;
  className?: string;
}) {
  return clsx(
    'group/entity-row flex w-full min-w-0 items-center text-left transition-[background-color,color,opacity] duration-150 ease-out motion-reduce:transition-none',
    variant === 'compact' ? 'gap-2 rounded-[6px] px-2 py-1 text-sm' : 'gap-2.5 rounded-md px-2.5 py-2 text-sm',
    selected || active
      ? 'bg-background-selected text-text-default'
      : 'text-text-subtle hover:bg-background-selected hover:text-text-default',
    clickable && FOCUS_RING_CLASS,
    disabled && 'pointer-events-none opacity-50',
    className,
  );
}

function EntityRowContent({
  leadingControls,
  icon,
  title,
  subtitle,
  badges,
  trailing,
  menu,
  variant,
  contentClassName,
  titleClassName,
  trailingClassName,
}: Required<Pick<EntityRowProps, 'variant'>> & Pick<EntityRowProps,
  'leadingControls'
  | 'icon'
  | 'title'
  | 'subtitle'
  | 'badges'
  | 'trailing'
  | 'menu'
  | 'contentClassName'
  | 'titleClassName'
  | 'trailingClassName'
>) {
  return (
    <>
      {leadingControls ? <span className="shrink-0">{leadingControls}</span> : null}
      {icon ? (
        <span
          aria-hidden="true"
          className={clsx('shrink-0 text-text-subtle group-hover/entity-row:text-text-default', variant === 'compact' ? 'mt-0.5' : '')}
        >
          {icon}
        </span>
      ) : null}
      <span className={clsx('min-w-0 flex-1', contentClassName)}>
        <span className={clsx('flex min-w-0 items-center gap-2', titleClassName)}>
          <span className="min-w-0 truncate font-medium">{title}</span>
          {badges ? <span className="shrink-0">{badges}</span> : null}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block min-w-0 truncate text-xs text-text-subtle">
            {subtitle}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className={clsx('shrink-0 text-xs text-text-subtle', trailingClassName)}>
          {trailing}
        </span>
      ) : null}
      {menu ? (
        <span className="shrink-0 opacity-0 transition-opacity duration-150 group-hover/entity-row:opacity-100 group-focus-within/entity-row:opacity-100 motion-reduce:transition-none">
          {menu}
        </span>
      ) : null}
    </>
  );
}

export const EntityRow = forwardRef<HTMLElement, EntityRowProps>(function EntityRow({
  leadingControls,
  icon,
  title,
  subtitle,
  badges,
  trailing,
  menu,
  contextMenu,
  selected,
  active,
  disabled,
  variant = 'default',
  className,
  contentClassName,
  titleClassName,
  trailingClassName,
  onClick,
  ariaLabel,
  titleAttribute,
}, ref) {
  const content = (
    <EntityRowContent
      leadingControls={leadingControls}
      icon={icon}
      title={title}
      subtitle={subtitle}
      badges={badges}
      trailing={trailing}
      menu={menu}
      variant={variant}
      contentClassName={contentClassName}
      titleClassName={titleClassName}
      trailingClassName={trailingClassName}
    />
  );
  const rowClassName = entityRowClassName({
    selected,
    active,
    disabled,
    variant,
    clickable: Boolean(onClick),
    className,
  });

  if (onClick) {
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        title={titleAttribute}
        className={rowClassName}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      aria-label={ariaLabel}
      title={titleAttribute}
      className={rowClassName}
    >
      {contextMenu ? (
        <>
          {content}
          {contextMenu}
        </>
      ) : content}
    </div>
  );
});

export function PanelShell({
  id,
  focusZone,
  as: Component = 'section',
  collapsed,
  width,
  collapsedWidth,
  className,
  children,
}: {
  id?: string;
  focusZone?: string;
  as?: 'aside' | 'section';
  collapsed?: boolean;
  width?: number;
  collapsedWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Component
      id={id}
      data-hackdesk-focus={focusZone}
      tabIndex={focusZone ? -1 : undefined}
      className={clsx(
        'flex shrink-0 flex-col overflow-hidden outline-none',
        PANEL_TRANSITION_CLASS,
        className,
      )}
      style={width ? { width: collapsed && collapsedWidth ? collapsedWidth : width } : undefined}
    >
      {children}
    </Component>
  );
}

export function PanelHeader({
  title,
  subtitle,
  actions,
  titleElement: TitleElement = 'h2',
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  titleElement?: 'h2' | 'div';
  className?: string;
}) {
  return (
    <header className={clsx('border-b border-border-default px-4 py-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <TitleElement className="truncate text-base font-semibold text-text-default">{title}</TitleElement>
          {subtitle ? <p className="mt-1 truncate text-xs text-text-subtle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
    </header>
  );
}

export function ToolbarIconButton({
  label,
  tooltip = label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tooltip?: ReactNode;
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      className={clsx(ICON_BUTTON_CLASS, className)}
      {...props}
    >
      {children}
    </button>
  );

  if (props.disabled) {
    return (
      <Tooltip content={tooltip}>
        <span className="inline-flex cursor-default">
          {button}
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={tooltip}>
      {button}
    </Tooltip>
  );
}

export function ToolbarDropdownIconTrigger({
  label,
  tooltip = label,
  children,
  className,
}: {
  label: string;
  tooltip?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={clsx(ICON_BUTTON_CLASS, className)}
          >
            {children}
          </button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </TooltipRoot>
  );
}

export function ToolbarDropdownMoreTrigger({
  label = 'More actions',
  tooltip = label,
  className,
}: {
  label?: string;
  tooltip?: ReactNode;
  className?: string;
}) {
  return (
    <ToolbarDropdownIconTrigger label={label} tooltip={tooltip} className={className}>
      <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
    </ToolbarDropdownIconTrigger>
  );
}

function SectionHeader({
  title,
  subtitle,
  dirty,
  actions,
  buttonProps,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  dirty?: boolean;
  actions?: ReactNode;
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2">
      <button
        type="button"
        {...buttonProps}
        className={clsx(
          'flex min-w-0 flex-1 items-center gap-2 rounded-[6px] text-left text-xs font-semibold uppercase tracking-wide text-text-subtle transition-colors hover:text-text-default',
          FOCUS_RING_CLASS,
          buttonProps?.className,
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={clsx('h-3.5 w-3.5 shrink-0', COLLAPSE_ICON_CLASS, buttonProps?.['aria-expanded'] ? '' : '-rotate-90')}
        />
        <span className="min-w-0 truncate">{title}</span>
        {dirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-default" aria-label="Unsaved changes" /> : null}
        {subtitle ? <span className="min-w-0 truncate normal-case tracking-normal text-text-subtle">{subtitle}</span> : null}
      </button>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function CollapsibleSection({
  title,
  subtitle,
  dirty,
  defaultOpen = true,
  children,
  actions,
  className,
  contentClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  dirty?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={clsx('border-b border-border-default/70 py-2.5 last:border-b-0', className)}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        dirty={dirty}
        actions={actions}
        buttonProps={{
          'aria-label': typeof title === 'string' ? title : undefined,
          'aria-expanded': open,
          'aria-controls': contentId,
          onClick: () => setOpen((current) => !current),
        }}
      />
      <div
        id={contentId}
        hidden={!open}
        className={clsx(
          'grid overflow-hidden transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={clsx('space-y-2.5 pt-2.5', contentClassName)}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div className="max-w-72 space-y-2">
        {icon ? <div className="mx-auto flex h-8 w-8 items-center justify-center text-text-subtle">{icon}</div> : null}
        <p className="text-sm font-medium text-text-default">{title}</p>
        {description ? <p className="text-xs leading-5 text-text-subtle">{description}</p> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export type { EntityRowProps };
