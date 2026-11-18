import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';

import { cn } from '@/lib/utils';

const radioGroupVariantClassNames = {
  default: '',
  // A track of equal-width segments; the page sets its width (for example `flex-1`).
  segmented: 'inline-grid auto-cols-fr grid-flow-col gap-0.5 rounded-md border border-border-default bg-background-muted p-0.5',
} as const;

type RadioGroupProps<Value> = RadioGroupPrimitive.Props<Value> & {
  variant?: keyof typeof radioGroupVariantClassNames;
};

// A plain function, not forwardRef, so `onValueChange` keeps the group's value type.
function RadioGroup<Value>({ className, variant = 'default', ...props }: RadioGroupProps<Value>) {
  return <RadioGroupPrimitive className={cn(radioGroupVariantClassNames[variant], className)} {...props} />;
}

const radioGroupItemBaseClassName =
  'shrink-0 cursor-default disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-default';

// Each variant reproduces what its call sites drew before the variants existed, including classes
// they inherited from the radio dot (for example a swatch's default border colour).
const radioGroupItemVariantClassNames = {
  // The plain radio dot.
  dot: 'inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-default bg-background-default text-primary-default transition-colors data-[checked]:border-primary-default',
  // A full-width row in a divided list, with a RadioGroupDot and its label inside.
  row: 'group flex h-auto w-full cursor-pointer items-start justify-start gap-3 border-0 border-b border-border-subtle bg-transparent px-4 py-3 text-left text-primary-default transition-colors last:border-b-0 first:rounded-t-md last:rounded-b-md hover:bg-background-hover focus-visible:ring-inset focus-visible:ring-offset-0',
  // A bordered card with a RadioGroupDot and its label inside.
  card: 'group flex h-auto w-full cursor-pointer items-start justify-start gap-3 rounded-md border border-border-default bg-background-default px-3 py-2.5 text-left text-primary-default transition-colors data-[checked]:border-primary-default data-[checked]:bg-primary-soft/40',
  // A picture above a label; the page sets its width.
  tile: 'flex h-auto cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-transparent bg-background-default px-1.5 py-2 text-center text-primary-default transition-colors hover:bg-element-bg-hover data-[checked]:border-primary-default/50 data-[checked]:bg-primary-soft/40',
  // One segment of a `segmented` RadioGroup.
  segment: 'flex h-7 min-w-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-sm border-0 bg-transparent px-2 text-xs text-text-subtle transition-colors hover:text-text-default focus-visible:ring-inset focus-visible:ring-offset-0 data-[checked]:bg-background-selected data-[checked]:font-medium data-[checked]:text-text-default',
  // A square holding a glyph; the page sets its size.
  swatch: 'flex items-center justify-center rounded-md border border-border-default bg-background-default text-lg text-primary-default transition-colors hover:bg-element-bg-hover data-[checked]:border-primary-default data-[checked]:bg-primary-soft',
  // A square filled with the `--swatch` colour; the page sets its size and the variable.
  'color-swatch': 'flex items-center justify-center rounded-md border border-border-default bg-(--swatch) text-primary-default transition-transform hover:scale-105 data-[checked]:border-primary-default data-[checked]:ring-2 data-[checked]:ring-primary-default data-[checked]:ring-offset-2 data-[checked]:ring-offset-background-default',
} as const;

type RadioGroupItemProps = React.ComponentPropsWithoutRef<typeof RadioPrimitive.Root> & {
  variant?: keyof typeof radioGroupItemVariantClassNames;
};

const RadioGroupItem = React.forwardRef<React.ElementRef<typeof RadioPrimitive.Root>, RadioGroupItemProps>(
  ({ className, variant = 'dot', ...props }, ref) => (
    <RadioPrimitive.Root
      ref={ref}
      className={cn(radioGroupItemBaseClassName, radioGroupItemVariantClassNames[variant], className)}
      {...props}
    />
  ),
);
RadioGroupItem.displayName = 'RadioGroupItem';

const RadioGroupIndicator = React.forwardRef<
  React.ElementRef<typeof RadioPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof RadioPrimitive.Indicator>
>(({ className, ...props }, ref) => (
  <RadioPrimitive.Indicator
    ref={ref}
    className={cn(
      'block h-2 w-2 rounded-full bg-current data-[unchecked]:hidden',
      className,
    )}
    {...props}
  />
));
RadioGroupIndicator.displayName = 'RadioGroupIndicator';

/** The radio dot drawn inside a `row` or `card` item, next to its label. */
function RadioGroupDot() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border-default bg-background-default text-primary-default group-data-[checked]:border-primary-default"
    >
      <RadioGroupIndicator />
    </span>
  );
}

export {
  RadioGroup,
  RadioGroupDot,
  RadioGroupIndicator,
  RadioGroupItem,
};
