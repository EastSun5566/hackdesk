import { Pin } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';

import type { QuickCaptureEditorHandle } from './quick-capture/QuickCaptureEditor';

// CodeMirror loads with the popup, not with the main window's first paint.
const QuickCaptureEditor = lazy(() => import('./quick-capture/QuickCaptureEditor'));

const CAPTURED_STATUS_MS = 1600;

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
    return true;
  } catch {
    return false;
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
  const api = window.hackdeskQuickCaptureAPI;
  const [content, setContent] = useState(() => readQuickCaptureBuffer());
  const editorRef = useRef<QuickCaptureEditorHandle | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const contentRef = useRef(content);
  const [error, setError] = useState<string | null>(null);
  /** Capturing while a submission is in flight; captured briefly after a pinned capture lands. */
  const [status, setStatus] = useState<'idle' | 'submitting' | 'captured'>('idle');
  const submitting = status === 'submitting';
  const [pinned, setPinnedState] = useState(false);
  const pinnedRef = useRef(pinned);
  const isMac = navigator.userAgent.includes('Mac');
  const pinShortcut = isMac ? '⇧⌘P' : 'Ctrl+Shift+P';

  const focusEditor = useCallback(() => {
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }

    focusFrameRef.current = window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      focusFrameRef.current = null;
    });
  }, []);

  // The editor loads after the first render; it takes focus once it is there.
  const attachEditor = useCallback((handle: QuickCaptureEditorHandle | null) => {
    editorRef.current = handle;
    if (handle) focusEditor();
  }, [focusEditor]);

  useEffect(() => {
    focusEditor();
    window.addEventListener('focus', focusEditor);
    return () => {
      window.removeEventListener('focus', focusEditor);
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
      }
    };
  }, [focusEditor]);

  const applyPinned = useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinnedState(next);
  }, []);

  useEffect(() => {
    if (!api?.getState) return undefined;
    let cancelled = false;
    void api.getState().then((state) => {
      if (!cancelled) applyPinned(state.pinned);
    }).catch(() => undefined);
    const unsubscribe = api.onStateChange?.((state) => applyPinned(state.pinned));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [api, applyPinned]);

  const togglePinned = useCallback(async () => {
    if (!api?.setPinned) return;
    const next = !pinnedRef.current;
    applyPinned(next);
    try {
      applyPinned((await api.setPinned(next)).pinned);
    } catch {
      applyPinned(!next);
    }
  }, [api, applyPinned]);

  const hide = useCallback(async () => {
    writeQuickCaptureBuffer(contentRef.current);
    await api?.hide();
  }, [api]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeQuickCaptureBuffer(content);
    }, 250);
    const flush = () => writeQuickCaptureBuffer(contentRef.current);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('pagehide', flush);
    };
  }, [content]);

  useEffect(() => {
    if (status !== 'captured') return undefined;
    const timeout = window.setTimeout(() => setStatus('idle'), CAPTURED_STATUS_MS);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void hide();
        return;
      }

      const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (mod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void togglePinned();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hide, isMac, togglePinned]);

  const updateContent = useCallback((nextContent: string) => {
    contentRef.current = nextContent;
    setContent(nextContent);
    setError(null);
    setStatus(current => (current === 'captured' ? 'idle' : current));
  }, []);

  const submit = async () => {
    const value = contentRef.current;
    if (submitting) {
      return;
    }

    if (!value.trim()) {
      setError('Write something before capturing.');
      focusEditor();
      return;
    }

    if (!api?.submit) {
      setError('Quick Hack is unavailable in this environment.');
      return;
    }

    if (!writeQuickCaptureBuffer(value)) {
      setError('HackDesk could not persist this capture. Copy the text before closing.');
      return;
    }

    setStatus('submitting');
    setError(null);
    try {
      const result = await api.submit(value);
      if (!result.accepted) {
        setError(result.error);
        setStatus('idle');
        focusEditor();
        return;
      }

      clearQuickCaptureBuffer();
      contentRef.current = '';
      setContent('');
      // Pinned, the popup stays for the next capture, so say this one landed.
      setStatus(pinnedRef.current ? 'captured' : 'idle');
      if (pinnedRef.current) focusEditor();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to capture note.');
      setStatus('idle');
      focusEditor();
    }
  };

  const submitRef = useRef(submit);
  submitRef.current = submit;
  const submitFromEditor = useCallback(() => {
    void submitRef.current();
  }, []);

  return (
    <main className="flex h-dvh flex-col bg-background-default text-text-default">
      {isMac ? (
        <header className="relative flex h-10 shrink-0 items-center justify-center app-region-drag">
          <h1 className="max-w-56 truncate text-xs font-medium text-text-subtle">
            Quick Hack
          </h1>
        </header>
      ) : (
        <h1 className="sr-only">Quick Hack</h1>
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
          <Suspense fallback={<div className="min-h-0 flex-1" />}>
            <QuickCaptureEditor
              ref={attachEditor}
              value={content}
              label="Quick Hack note"
              placeholder="Write a note… Markdown works here."
              disabled={submitting}
              invalid={Boolean(error)}
              describedBy={error ? 'quick-capture-error' : undefined}
              onChange={updateContent}
              onSubmit={submitFromEditor}
            />
          </Suspense>
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
        <footer className="relative flex h-10 shrink-0 items-center justify-between px-2.5">
          <Button
            size="icon-sm"
            variant="ghost"
            type="button"
            aria-label="Pin Quick Hack"
            aria-pressed={pinned}
            aria-keyshortcuts={isMac ? 'Meta+Shift+P' : 'Control+Shift+P'}
            title={`${pinned ? 'Pinned: stays open after capture' : 'Pin to keep open after capture'} (${pinShortcut})`}
            onClick={() => void togglePinned()}
          >
            <Pin
              aria-hidden="true"
              className={cn('h-3.5 w-3.5', pinned ? 'fill-current text-primary-default' : 'text-text-subtle')}
            />
          </Button>
          <span
            role="status"
            className="pointer-events-none absolute inset-x-32 text-center text-xs tabular-nums text-text-subtle"
          >
            {submitting ? 'Capturing…' : status === 'captured' ? 'Captured' : ''}
          </span>
          <Button
            size="xs"
            variant="ghost"
            type="submit"
            disabled={submitting}
          >
            Capture
            <kbd aria-hidden="true" className="text-2xs font-normal text-text-subtle">
              {isMac ? '⌘↵' : 'Ctrl+Enter'}
            </kbd>
          </Button>
        </footer>
      </form>
    </main>
  );
}
