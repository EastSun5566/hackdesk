import { useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { EditorView } from '@codemirror/view';
import { AlertCircle, Check, Copy, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from '@/components/ui/toast';
import { acceptAiInline, closeAiInline, getAiInlineState, type AiInlineState } from '@/components/hackmd-live-preview/ai-inline/state';
import { AI_ACTION_DETAILS, AI_PROVIDER_TITLES, MAX_AI_INSTRUCTION_CHARACTERS, getAiErrorMessage, type AiAction } from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';

import type { AiInlineController } from './useAiInline';
import { writeClipboardText } from './useDocumentCommands';

const MENU_ACTIONS: AiAction[] = ['fix', 'improve', 'shorter', 'longer', 'translate', 'summarize', 'continue'];
const PANEL_CLASS = 'rounded-lg border border-border-default bg-background-default text-text-default shadow-lg';

/** Clicking a panel button must not take focus from the editor, whose keys accept and discard. */
function keepEditorFocus(event: MouseEvent) {
  event.preventDefault();
}

function close(view: EditorView) {
  view.dispatch({ effects: closeAiInline.of(null) });
  view.focus();
}

function AiMenu({ view, session, controller }: { view: EditorView; session: AiInlineState; controller: AiInlineController }) {
  const [query, setQuery] = useState('');
  const instruction = query.trim().slice(0, MAX_AI_INSTRUCTION_CHARACTERS);
  const scope = session.from === 0 && session.to === view.state.doc.length ? 'the whole note' : 'the selection';
  const provider = controller.providerId;

  const handleKeyDown = (event: KeyboardEvent) => {
    // The workbench and the editor both listen for Escape; this one only closes the menu.
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(view);
    }
  };

  // Clicking anywhere else dismisses the menu, like other popovers. Running a command also moves
  // focus to the editor, but by then the session has left the menu phase, so it is not closed.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (getAiInlineState(view.state).phase === 'menu') view.dispatch({ effects: closeAiInline.of(null) });
  };

  return (
    <div
      className={`${PANEL_CLASS} w-96 overflow-hidden`}
      role="dialog"
      aria-label="Ask AI"
      onBlur={handleBlur}
      // Items are not focusable, so a press on one would blur the input and close the menu first.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
    >
      <Command loop label="Ask AI or pick a command" onKeyDown={handleKeyDown}>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Ask AI or pick a command…"
        />
        <CommandList>
          <CommandGroup heading={`Edit ${scope}`}>
            {MENU_ACTIONS.map((action) => {
              const details = AI_ACTION_DETAILS[action];
              const label = action === 'translate' ? `Translate to ${controller.translateLanguage}` : details.label;
              return (
                <CommandItem
                  key={action}
                  value={label}
                  keywords={details.keywords}
                  onSelect={() => controller.run(view, { action })}
                >
                  {label}
                </CommandItem>
              );
            })}
          </CommandGroup>
          {instruction ? (
            <CommandGroup heading="Your request" forceMount>
              <CommandItem
                forceMount
                value={`ask-ai ${instruction}`}
                onSelect={() => controller.run(view, { action: 'custom', instruction })}
              >
                <Sparkles aria-hidden="true" className="h-4 w-4" />
                <span className="truncate">Ask AI: {instruction}</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
      <div className="flex items-center justify-between gap-2 border-t border-border-default px-3 py-1.5 text-xs text-text-subtle">
        {controller.providers.length > 1 && provider ? (
          <button
            type="button"
            className="rounded px-1 hover:bg-background-selected hover:text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label={`Provider: ${AI_PROVIDER_TITLES[provider]}. Switch provider`}
            onClick={() => {
              const index = controller.providers.indexOf(provider);
              controller.setProviderId(controller.providers[(index + 1) % controller.providers.length]!);
            }}
          >
            {AI_PROVIDER_TITLES[provider]} ⇄
          </button>
        ) : (
          <span>{provider ? AI_PROVIDER_TITLES[provider] : 'No provider'}</span>
        )}
        <span>{controller.isTeamNote ? 'Team note · ' : ''}Esc to close</span>
      </div>
    </div>
  );
}

function AiStatus({ view, session, controller }: { view: EditorView; session: AiInlineState; controller: AiInlineController }) {
  const action = controller.lastRun?.action ?? 'custom';
  const details = AI_ACTION_DETAILS[action];

  if (session.phase === 'running') {
    return (
      <div className={`${PANEL_CLASS} flex items-center gap-2 px-2 py-1.5 text-xs`} role="status" aria-live="polite">
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-primary-default motion-reduce:animate-none" />
        <span>{details.progressLabel}</span>
        <Button size="xs" variant="ghost" onMouseDown={keepEditorFocus} onClick={() => close(view)}>
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          Stop
          <kbd className="text-text-subtle">Esc</kbd>
        </Button>
      </div>
    );
  }

  if (session.phase === 'error') {
    return (
      <div className={`${PANEL_CLASS} flex max-w-md items-center gap-2 px-2 py-1.5 text-xs`} role="alert">
        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-destructive-default" />
        <span className="min-w-0 flex-1">{session.error}</span>
        <Button size="xs" variant="secondary" onMouseDown={keepEditorFocus} onClick={() => controller.retry(view)}>
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          Retry
        </Button>
        <Button size="xs" variant="ghost" onMouseDown={keepEditorFocus} onClick={() => close(view)}>Close</Button>
      </div>
    );
  }

  const copy = () => {
    void writeClipboardText(getHackDeskAPI(), getAiInlineState(view.state).output.trim())
      .then(() => toast.success('Copied AI result.'))
      .catch(error => toast.error(getAiErrorMessage(error)));
  };

  return (
    <div className={`${PANEL_CLASS} flex items-center gap-1 px-1.5 py-1 text-xs`} role="toolbar" aria-label="AI result">
      <Button size="xs" variant="primary" onMouseDown={keepEditorFocus} onClick={() => acceptAiInline(view)}>
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
        {details.delivery === 'replace' ? 'Replace' : 'Insert'}
        <kbd className="opacity-70">⏎</kbd>
      </Button>
      <Button size="xs" variant="ghost" onMouseDown={keepEditorFocus} onClick={() => close(view)}>
        Discard
        <kbd className="text-text-subtle">Esc</kbd>
      </Button>
      <Button size="xs" variant="ghost" onMouseDown={keepEditorFocus} onClick={() => controller.retry(view)}>
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
        Retry
      </Button>
      <Button size="xs" variant="ghost" onMouseDown={keepEditorFocus} onClick={copy}>
        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        Copy
      </Button>
    </div>
  );
}

export function AiInlinePanel({ view, session, controller }: { view: EditorView; session: AiInlineState; controller: AiInlineController }) {
  if (session.phase === 'menu') return <AiMenu view={view} session={session} controller={controller} />;
  if (session.phase === 'idle') return null;
  return <AiStatus view={view} session={session} controller={controller} />;
}
