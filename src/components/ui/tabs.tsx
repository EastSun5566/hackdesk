import type * as React from 'react';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const tabsListVariantClassNames = {
  default: '',
  /** Tabs stacked in a column, as a sidebar's sections. */
  vertical: 'flex-col items-stretch gap-0.5',
} as const;

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: keyof typeof tabsListVariantClassNames }) {
  return (
    <TabsPrimitive.List
      className={cn('flex items-center gap-1', tabsListVariantClassNames[variant], className)}
      {...props}
    />
  );
}

const tabsTriggerVariantClassNames = {
  default: '',
  /** A row in a `vertical` list: full width, label at the start, wrapping when long. */
  row: 'h-auto w-full justify-start whitespace-normal px-2 text-left',
} as const;

function TabsTrigger({
  className,
  variant = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Tab> & { variant?: keyof typeof tabsTriggerVariantClassNames }) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-normal leading-5 text-text-subtle transition-colors hover:bg-background-hover hover:text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring data-[active]:bg-background-primary-subtler data-[active]:text-text-emphasize data-[disabled]:pointer-events-none data-[disabled]:opacity-65',
        tabsTriggerVariantClassNames[variant],
        className,
      )}
      {...props}
    />
  );
}

const tabsContentVariantClassNames = {
  default: '',
  /** A scrolling page, such as a Settings section, with its focus ring inside its edges. */
  page: 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8 pl-8 pr-8 pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
} as const;

function TabsContent({
  className,
  variant = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Panel> & { variant?: keyof typeof tabsContentVariantClassNames }) {
  return (
    <TabsPrimitive.Panel
      className={cn('outline-none', tabsContentVariantClassNames[variant], className)}
      {...props}
    />
  );
}

export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
};
