import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  AlertCircle,
  Loader2,
  RefreshCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useEscapeKey } from '@/hooks/useEscapeKey';
import {
  clearAgentSession,
  createAgentMessage,
  createEmptyAgentSession,
  getAgentRuntimeStatus,
  getCurrentNoteContext,
  getPendingAgentLaunchIntent,
  loadAgentSession,
  openAgentSettings,
  saveAgentSession,
  sendAgentMessage,
  type AgentIntent,
  type AgentRuntimeStatus,
  type AgentSession,
} from '@/lib/agent';

const shellClassName = 'flex h-full w-full flex-col overflow-hidden bg-background-default';
const primaryButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary-default px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const secondaryButtonClassName = 'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border-default bg-background-default px-3 py-2 text-sm font-medium text-text-default transition-colors hover:bg-background-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const iconButtonClassName = 'inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-default bg-background-default text-text-subtle transition-colors hover:bg-background-selected hover:text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const inputClassName = 'min-h-[104px] w-full rounded-xl border border-border-default bg-background-default px-3 py-2 text-sm text-text-default placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:cursor-not-allowed disabled:opacity-50';
const shortcutPillClassName = 'inline-flex items-center rounded-md border border-border-default bg-background-muted px-2 py-0.5 font-mono text-[11px] font-semibold tracking-tight text-text-default';

function normalizeContextTitle(title: string) {
  return title.replace(/\s*[-–—]\s*HackMD$/i, '').trim() || 'Untitled note';
}

function countWords(content: string) {
  return content.split(/\s+/).filter(Boolean).length;
}

export function Agent() {
  const [initialIntent] = useState<AgentIntent>(() => getPendingAgentLaunchIntent());
  const [session, setSession] = useState<AgentSession>(() => loadAgentSession());
  const [prompt, setPrompt] = useState('');
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<AgentRuntimeStatus | null>(null);
  const didAutoRunSummary = useRef(false);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const latestAssistantMessageRef = useRef<HTMLElement | null>(null);
  const previousMessageCountRef = useRef(0);

  const closeWindow = useCallback(() => {
    void Promise.resolve(getCurrentWebviewWindow().close()).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unable to close the note agent.';
      toast.error(message);
    });
  }, []);

  useEscapeKey(closeWindow);

  useEffect(() => {
    saveAgentSession(session);
  }, [session]);

  const refreshContext = useCallback(async () => {
    setIsLoadingContext(true);
    setContextError(null);

    try {
      const context = await getCurrentNoteContext();
      setSession((currentSession) => ({
        ...currentSession,
        context,
        updatedAt: new Date().toISOString(),
      }));

      if (!context.isNote) {
        setContextError(context.reason ?? 'Open a HackMD note in the main window first.');
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to read the current HackMD page yet.';
      setContextError(message);
      toast.error(message);
    } finally {
      setIsLoadingContext(false);
    }
  }, []);

  const refreshRuntimeStatus = useCallback(async () => {
    try {
      const nextStatus = await getAgentRuntimeStatus();
      setRuntimeStatus(nextStatus);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to check the agent provider status.';

      toast.error(message);
    }
  }, []);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    void refreshRuntimeStatus();
  }, [refreshRuntimeStatus]);

  const scrollMessagesToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  const scrollLatestAssistantMessageIntoView = useCallback(() => {
    latestAssistantMessageRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  useEffect(() => {
    if (!session.context?.isNote || isLoadingContext || isSubmitting) {
      return;
    }

    promptInputRef.current?.focus({ preventScroll: true });
  }, [isLoadingContext, isSubmitting, session.context?.isNote]);

  useEffect(() => {
    const currentMessageCount = session.messages.length;
    const previousMessageCount = previousMessageCountRef.current;

    if (currentMessageCount === 0) {
      previousMessageCountRef.current = 0;
      return;
    }

    const latestMessage = session.messages[currentMessageCount - 1];

    if (previousMessageCount === 0) {
      scrollMessagesToBottom();
    } else if (currentMessageCount > previousMessageCount) {
      if (latestMessage?.role === 'assistant') {
        scrollLatestAssistantMessageIntoView();
      } else {
        scrollMessagesToBottom();
      }
    }

    previousMessageCountRef.current = currentMessageCount;
  }, [scrollLatestAssistantMessageIntoView, scrollMessagesToBottom, session.messages]);

  const runPrompt = useCallback(async (nextPrompt: string, intent: AgentIntent = 'ask') => {
    const normalizedPrompt = nextPrompt.trim();

    if (!normalizedPrompt || isSubmitting) {
      return;
    }

    const userMessage = createAgentMessage('user', normalizedPrompt);

    setSession((currentSession) => ({
      ...currentSession,
      messages: [...currentSession.messages, userMessage],
      updatedAt: new Date().toISOString(),
    }));
    setPrompt('');
    setIsSubmitting(true);

    try {
      const response = await sendAgentMessage({
        prompt: normalizedPrompt,
        context: session.context,
        intent,
      });

      setSession((currentSession) => ({
        ...currentSession,
        messages: [...currentSession.messages, createAgentMessage('assistant', response)],
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'The note agent could not respond just now.';

      setSession((currentSession) => ({
        ...currentSession,
        messages: [...currentSession.messages, createAgentMessage('assistant', message)],
        updatedAt: new Date().toISOString(),
      }));
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, session.context]);

  useEffect(() => {
    if (initialIntent !== 'summary' || didAutoRunSummary.current || isLoadingContext || isSubmitting) {
      return;
    }

    if (!session.context?.isNote || session.messages.length > 0) {
      return;
    }

    didAutoRunSummary.current = true;
    void runPrompt('Summarize the current note.', 'summary');
  }, [initialIntent, isLoadingContext, isSubmitting, runPrompt, session.context, session.messages.length]);

  const noteAvailable = Boolean(session.context?.isNote);
  const needsProviderSetup = runtimeStatus?.isConfigured === false && runtimeStatus.source === 'none';
  const contextTitle = session.context ? normalizeContextTitle(session.context.title) : 'Open a Note to Start';
  const contextWordCount = session.context?.content ? countWords(session.context.content) : 0;
  const contentStatusLabel = !noteAvailable
    ? null
    : session.context?.content
      ? `${contextWordCount} words`
      : session.context?.contentReason
        ? `Metadata only · ${session.context.contentReason}`
        : 'Metadata only';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runPrompt(prompt, 'ask');
  };

  const handleClearSession = () => {
    clearAgentSession();
    didAutoRunSummary.current = false;
    setSession(createEmptyAgentSession());
    setPrompt('');
    toast.success('Cleared the note agent session');
    void refreshContext();
  };

  const canSubmit = prompt.trim().length > 0 && !isSubmitting && !isLoadingContext && noteAvailable;

  const handlePromptKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey) || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    void runPrompt(prompt, 'ask');
  }, [canSubmit, prompt, runPrompt]);

  const handleOpenAgentSettings = useCallback(async () => {
    try {
      await openAgentSettings('agent');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to open Settings > Agent right now.';

      toast.error(message);
    }
  }, []);

  return (
    <div className="h-screen w-screen bg-background-default text-text-default">
      <div className={shellClassName}>
        <header className="border-b border-border-default px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div data-tauri-drag-region className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 text-sm text-text-subtle" data-tauri-drag-region>
                <Sparkles aria-hidden="true" className="h-4 w-4" />
                Current Note
              </div>

              <h1 className="text-xl font-semibold text-balance" data-tauri-drag-region>{contextTitle}</h1>

              <div className="min-w-0 text-xs text-text-subtle">
                {noteAvailable ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate">{session.context?.path}</span>
                    {contentStatusLabel ? <span>• {contentStatusLabel}</span> : null}
                  </div>
                ) : (
                  <span>Open a HackMD note in the main window.</span>
                )}
              </div>

              {contextError ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="inline-flex items-center gap-2 rounded-full bg-destructive-soft px-3 py-1 text-sm text-destructive-default"
                >
                  <AlertCircle aria-hidden="true" className="h-4 w-4" />
                  {contextError}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshContext()}
                disabled={isLoadingContext}
                className={iconButtonClassName}
                aria-label={isLoadingContext ? 'Refreshing note' : 'Refresh note'}
                title={isLoadingContext ? 'Refreshing…' : 'Refresh'}
              >
                {isLoadingContext ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCcw aria-hidden="true" className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={closeWindow}
                className={iconButtonClassName}
                aria-label="Close note agent"
                title="Close"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {needsProviderSetup ? (
            <section className="border-b border-border-default px-4 py-3 sm:px-6">
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-text-default">
                    <AlertCircle aria-hidden="true" className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    Live provider not configured yet
                  </div>
                  <p className="text-sm text-text-subtle">
                    {runtimeStatus?.reason ?? 'Open Settings > Agent to add your API key, base URL, and model.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleOpenAgentSettings()}
                  className={secondaryButtonClassName}
                >
                  Open Settings
                </button>
              </div>
            </section>
          ) : null}

          <section aria-live="polite" className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {session.messages.length === 0 ? (
              <div className="flex h-full items-center justify-center py-8 text-sm text-text-subtle">
                No messages yet.
              </div>
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-3">
                {session.messages.map((message) => (
                  <article
                    key={message.id}
                    ref={message.role === 'assistant' && message.id === session.messages.at(-1)?.id
                      ? latestAssistantMessageRef
                      : undefined}
                    className={`rounded-2xl border px-4 py-3 ${message.role === 'assistant'
                      ? 'border-border-default bg-background-muted'
                      : 'border-primary-default/30 bg-primary-soft'
                    }`}
                  >
                    <div className="mb-1 text-xs font-medium text-text-subtle">
                      {message.role === 'assistant' ? 'Agent' : 'You'}
                    </div>
                    <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6">{message.content}</p>
                  </article>
                ))}
                <div ref={messagesEndRef} aria-hidden="true" />
              </div>
            )}
          </section>

          <section className="border-t border-border-default px-4 py-4 sm:px-6">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="agent-prompt" className="text-sm font-medium">
                  Ask About This Note
                </label>
                {isSubmitting ? (
                  <div className="inline-flex items-center gap-2 text-sm text-text-subtle">
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    Thinking…
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                <span>Quick open anytime with</span>
                <span className={shortcutPillClassName}>⌘⇧I</span>
              </div>

              <textarea
                ref={promptInputRef}
                id="agent-prompt"
                name="prompt"
                autoComplete="off"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="Ask about this note…"
                className={inputClassName}
                disabled={isLoadingContext || !noteAvailable}
                readOnly={isSubmitting}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void runPrompt('Summarize the current note.', 'summary')}
                  disabled={isLoadingContext || isSubmitting || !noteAvailable}
                  className={secondaryButtonClassName}
                >
                  <Sparkles aria-hidden="true" className="h-4 w-4" />
                  Summarize
                </button>

                <div className="flex items-center gap-2">
                  {session.messages.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearSession}
                      className={secondaryButtonClassName}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={primaryButtonClassName}
                  >
                    {isSubmitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
                    Send
                  </button>
                </div>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
