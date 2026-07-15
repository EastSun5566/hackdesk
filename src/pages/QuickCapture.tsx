import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Textarea } from '@/components/ui/field';

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

export function QuickCapture() {
  const api = window.hackdeskAPI;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const [content, setContent] = useState(() => readQuickCaptureBuffer());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const platform = api?.platform ?? 'unknown';
  const isMac = platform === 'darwin' || platform.toLowerCase().includes('mac');
  const characterCount = Array.from(content).length;

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
      {isMac ? (
        <header className="relative flex h-10 shrink-0 items-center justify-center [-webkit-app-region:drag]">
          <h1 className="max-w-56 truncate text-xs font-medium text-text-subtle">
            Quick Capture
          </h1>
        </header>
      ) : (
        <h1 className="sr-only">Quick Capture</h1>
      )}
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          invalid={Boolean(error)}
          className="flex min-h-0 flex-1 flex-col space-y-0"
        >
          <FieldLabel className="sr-only">Capture note</FieldLabel>
          <Textarea
            ref={textareaRef}
            name="content"
            aria-describedby={error ? 'quick-capture-error' : undefined}
            value={content}
            placeholder="Write a quick note…"
            className="h-auto min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-5 py-4 text-base leading-7 text-text-default caret-primary-default shadow-none outline-none transition-none placeholder:text-text-subtle focus:border-transparent focus-visible:ring-0 data-[invalid]:border-0 data-[invalid]:focus:border-transparent data-[invalid]:focus-visible:ring-0"
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
            <p
              id="quick-capture-error"
              role="alert"
              className="shrink-0 px-5 pb-2 text-xs leading-5 text-destructive-default"
            >
              {error}
            </p>
          ) : null}
        </Field>
        <footer className="relative flex h-10 shrink-0 items-center justify-end px-2.5">
          {submitting || (!error && characterCount > 0) ? (
            <span className="pointer-events-none absolute inset-x-32 text-center text-xs tabular-nums text-text-subtle">
              {submitting
                ? 'Capturing…'
                : `${characterCount} ${characterCount === 1 ? 'character' : 'characters'}`}
            </span>
          ) : null}
          <Button
            className="h-7 gap-1.5 px-2 text-xs text-text-subtle hover:text-text-default"
            size="sm"
            variant="ghost"
            type="submit"
            disabled={submitting}
          >
            Capture
            <kbd aria-hidden="true" className="font-sans text-[11px] font-normal text-text-subtle">
              {isMac ? '⌘↵' : 'Ctrl+Enter'}
            </kbd>
          </Button>
        </footer>
      </form>
    </main>
  );
}
