import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/utils';

export const QUICK_CAPTURE_BUFFER_STORAGE_KEY = 'hackdesk_quick_capture_buffer';

type StoredQuickCaptureBuffer = {
  version: 1;
  content: string;
};

function readQuickCaptureBuffer(storage: Storage = window.localStorage) {
  try {
    const stored = JSON.parse(storage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY) ?? 'null') as (
      Partial<StoredQuickCaptureBuffer> | null
    );
    return stored?.version === 1 && typeof stored.content === 'string' ? stored.content : '';
  } catch {
    return '';
  }
}

function writeQuickCaptureBuffer(content: string, storage: Storage = window.localStorage) {
  try {
    storage.setItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY, JSON.stringify({ version: 1, content }));
  } catch {
    // The in-memory capture remains usable when persistent storage is unavailable.
  }
}

function clearQuickCaptureBuffer(storage: Storage = window.localStorage) {
  try {
    storage.removeItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY);
  } catch {
    // The accepted capture is still cleared from the current window below.
  }
}

function getQuickCaptureShortcutLabel(platform: string) {
  return platform === 'darwin' || platform.toLowerCase().includes('mac')
    ? '⌃⌥H'
    : 'Ctrl+Alt+H';
}

export function QuickCapture() {
  const api = window.hackdeskAPI;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const [content, setContent] = useState(() => readQuickCaptureBuffer());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const platform = api?.platform ?? 'unknown';
  const isMac = platform === 'darwin' || platform.toLowerCase().includes('mac');
  const shortcutLabel = getQuickCaptureShortcutLabel(platform);

  const focusTextarea = useCallback(() => {
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }

    focusFrameRef.current = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
      focusFrameRef.current = null;
    });
  }, []);

  useEffect(() => {
    focusTextarea();
    window.addEventListener('focus', focusTextarea);
    return () => {
      window.removeEventListener('focus', focusTextarea);
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
      }
    };
  }, [focusTextarea]);

  const hide = useCallback(async () => {
    await api?.app.hideQuickCapture?.();
  }, [api]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      void hide();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hide]);

  const submit = async () => {
    if (!content.trim()) {
      setError('Write something before capturing.');
      focusTextarea();
      return;
    }

    if (!api?.app.submitQuickCapture) {
      setError('Quick Capture is unavailable in this environment.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await api.app.submitQuickCapture(content);
      if (!result.accepted) {
        setError(result.error);
        setSubmitting(false);
        focusTextarea();
        return;
      }

      clearQuickCaptureBuffer();
      setContent('');
      setSubmitting(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to capture note.');
      setSubmitting(false);
      focusTextarea();
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
          aria-label="Hide Quick Capture"
          className="[-webkit-app-region:no-drag]"
          size="icon"
          variant="ghost"
          onClick={() => void hide()}
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
              const nextContent = event.currentTarget.value;
              setContent(nextContent);
              writeQuickCaptureBuffer(nextContent);
              if (error) {
                setError(null);
              }
            }}
            onKeyDown={(event) => {
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
        <div className="flex justify-end">
          <Button size="sm" variant="primary" type="submit" disabled={submitting}>
            <Send aria-hidden="true" className="h-4 w-4" />
            Capture
          </Button>
        </div>
      </form>
    </main>
  );
}
