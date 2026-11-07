import type * as React from 'react';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        'inline-flex items-center justify-center rounded px-3 py-2 text-sm font-normal leading-5 text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-emphasize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring data-[active]:bg-background-selected data-[active]:text-text-emphasize data-[disabled]:pointer-events-none data-[disabled]:opacity-65',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Panel>) {
  return (
    <TabsPrimitive.Panel
      className={cn('outline-none', className)}
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
