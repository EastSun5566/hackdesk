import { useTheme } from '@/components/theme-provider';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-md group-[.toaster]:border group-[.toaster]:border-border-default group-[.toaster]:bg-background-default group-[.toaster]:text-text-default group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-text-subtle',
          actionButton:
            'group-[.toast]:bg-primary-default group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-primary-hover group-[.toast]:focus-visible:ring-2 group-[.toast]:focus-visible:ring-primary-default group-[.toast]:focus-visible:ring-offset-2 group-[.toast]:focus-visible:ring-offset-background-default',
          cancelButton:
            'group-[.toast]:border group-[.toast]:border-border-default group-[.toast]:bg-background-selected group-[.toast]:text-text-default group-[.toast]:hover:bg-background-muted group-[.toast]:focus-visible:ring-2 group-[.toast]:focus-visible:ring-primary-default group-[.toast]:focus-visible:ring-offset-2 group-[.toast]:focus-visible:ring-offset-background-default',
        },
      }}
      {...props}
    />
  );
}
