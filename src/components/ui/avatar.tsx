import * as React from 'react';
import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';

import { cn } from '@/lib/utils';

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      'inline-flex shrink-0 items-center justify-center overflow-hidden bg-background-selected text-text-default outline outline-1 -outline-offset-1 outline-white/10',
      className,
    )}
    {...props}
  />
));
Avatar.displayName = 'Avatar';

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, alt = '', loading = 'lazy', referrerPolicy = 'no-referrer', ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    alt={alt}
    loading={loading}
    referrerPolicy={referrerPolicy}
    className={cn('h-full w-full object-cover', className)}
    {...props}
  />
));
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn('flex h-full w-full items-center justify-center', className)}
    {...props}
  />
));
AvatarFallback.displayName = 'AvatarFallback';

export {
  Avatar,
  AvatarFallback,
  AvatarImage,
};
