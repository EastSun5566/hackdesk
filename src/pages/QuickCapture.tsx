import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/utils';

function getQuickCaptureShortcutLabel(platform: string) {
  return platform === 'darwin' || platform.toLowerCase().includes('mac')
    ? '⌃⌥H'
    : 'Ctrl+Alt+H';
}

export function QuickCapture() {
  const api = window.hackdeskAPI;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const platform = api?.platform ?? 'unknown';
  const isMac = platform === 'darwin' || platform.toLowerCase().includes('mac');
  const shortcutLabel = getQuickCaptureShortcutLabel(platform);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const close = async () => {
    await api?.app.closeQuickCapture?.();
  };

  const submit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('Write something before capturing.');
      textareaRef.current?.focus();
      return;
    }

    if (!api?.app.submitQuickCapture) {
      setError('Quick Capture is unavailable in this environment.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.app.submitQuickCapture(trimmedContent);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to capture note.');
      setSubmitting(false);
    }
  };

  return (
    <main className="flex h-dvh flex-col bg-background-default text-text-default">
      <header
        className={cn(
          'flex h-10 shrink-0 items-center gap-2 border-b border-border-default/70 pr-2 [-webkit-app-region:drag]',
          isMac ? 'pl-20' : 'pl-3',
        )}
      >
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-text-default">
          Quick Capture
        </h1>
        <kbd className="rounded border border-border-default/70 bg-background-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-text-subtle">
          {shortcutLabel}
        </kbd>
        <Button
          aria-label="Close Quick Capture"
          className="[-webkit-app-region:no-drag]"
          size="icon"
          variant="ghost"
          onClick={() => void close()}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </header>
      <form
        className="flex min-h-0 flex-1 flex-col gap-2.5 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field invalid={Boolean(error)} className="flex min-h-0 flex-1 flex-col gap-2 space-y-0">
          <FieldLabel className="sr-only">Capture note</FieldLabel>
          <Textarea
            ref={textareaRef}
            name="content"
            aria-describedby={error ? 'quick-capture-error' : undefined}
            value={content}
            placeholder="Write a quick note…"
            className={cn(
              'h-auto min-h-0 flex-1 resize-none rounded-lg border-border-default/70 bg-background-muted/50 p-3 text-sm leading-6 text-text-default shadow-none placeholder:text-text-subtle/70',
              'focus:border-focus-ring/70 focus-visible:ring-1 focus-visible:ring-focus-ring/60',
            )}
            disabled={submitting}
            onChange={(event) => {
              setContent(event.currentTarget.value);
              if (error) {
                setError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                void close();
                return;
              }

              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {error ? (
            <p id="quick-capture-error" role="alert" className="text-xs text-destructive-default">
              {error}
            </p>
          ) : (
            <FieldDescription className="text-pretty">
              Press {isMac ? '⌘' : 'Ctrl'}+Enter to capture as a draft.
            </FieldDescription>
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button
            className="text-text-subtle"
            size="sm"
            variant="ghost"
            onClick={() => void close()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={submitting}>
            <Send aria-hidden="true" className="h-4 w-4" />
            Capture
          </Button>
        </div>
      </form>
    </main>
  );
}
