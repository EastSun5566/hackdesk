import { useTheme } from '@/components/theme-provider';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group pointer-events-auto flex w-full items-center gap-3 rounded-md border border-border-default bg-background-default p-4 text-text-default shadow-lg',
          title: 'text-sm font-medium text-text-default',
          description: 'text-sm text-text-subtle',
          actionButton:
            'inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default',
          cancelButton:
            'inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border-default bg-background-selected px-3 text-sm font-medium text-text-default transition-colors hover:bg-background-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default',
          closeButton:
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-background-selected hover:text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default',
          success: 'border-success-default/40',
          error: 'border-destructive-default/40',
          warning: 'border-primary-default/30',
          info: 'border-primary-default/30',
        },
      }}
      {...props}
    />
  );
}
