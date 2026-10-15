import { useEffect, useRef, useState } from 'react';
import { Copy, Loader2, Sparkles, Square } from 'lucide-react';

import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectLabelValue, SelectTrigger } from '@/components/ui/select';
import {
  AI_ACTION_LABELS,
  AI_ACTIONS,
  AI_PROVIDER_TITLES,
  MAX_AI_INPUT_CHARACTERS,
  getAiErrorMessage,
  type AiAction,
  type AiProviderId,
} from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';

import { writeClipboardText } from './useDocumentCommands';

export type AiAssistSource = {
  from: number;
  to: number;
  text: string;
  isSelection: boolean;
};

/** Rewrite and Translate replace the source; Summarize and Continue add after it. */
export type AiApplyMode = 'replace' | 'insert-after';

const APPLY_MODES: Record<AiAction, AiApplyMode> = {
  summarize: 'insert-after',
  rewrite: 'replace',
  continue: 'insert-after',
  translate: 'replace',
};

type RunState =
  | { status: 'idle' }
  | { status: 'running'; requestId: string }
  | { status: 'done' }
  | { status: 'error'; message: string };

function applyLabel(action: AiAction, isSelection: boolean) {
  if (APPLY_MODES[action] === 'replace') return isSelection ? 'Replace Selection' : 'Replace Note';
  return action === 'summarize' ? 'Insert Below' : 'Insert';
}

export function AiAssistDialog({
  open,
  source,
  noteTitle,
  isTeamNote,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  source: AiAssistSource | null;
  noteTitle: string;
  isTeamNote: boolean;
  onOpenChange: (open: boolean) => void;
  /** Returns false when the note changed after the request started, so nothing was applied. */
  onApply: (mode: AiApplyMode, result: string) => boolean;
}) {
  const api = getHackDeskAPI();
  const [providers, setProviders] = useState<AiProviderId[] | null>(null);
  const [providerId, setProviderId] = useState<AiProviderId | null>(null);
  const [action, setAction] = useState<AiAction>('rewrite');
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [output, setOutput] = useState('');
  const [run, setRunState] = useState<RunState>({ status: 'idle' });
  // Read by stream callbacks, which must see a Stop before React re-renders.
  const runRef = useRef<RunState>(run);
  const setRun = (next: RunState) => {
    runRef.current = next;
    setRunState(next);
  };

  useEffect(() => {
    if (!open || !api?.ai) return;
    let cancelled = false;
    void Promise.all([api.ai.listProviders(), api.settings.get()]).then(([statuses, settings]) => {
      if (cancelled) return;
      const enabled = statuses.filter(status => status.enabled).map(status => status.id);
      setProviders(enabled);
      const preferred = settings.ai?.defaultProvider;
      setProviderId(preferred && enabled.includes(preferred) ? preferred : enabled[0] ?? null);
    }).catch(() => {
      if (!cancelled) setProviders([]);
    });
    return () => {
      cancelled = true;
    };
  }, [api, open]);

  const cancelRun = () => {
    const current = runRef.current;
    if (current.status === 'running') void api?.ai?.cancelTurn(current.requestId).catch(() => undefined);
    setRun({ status: 'idle' });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) cancelRun();
    onOpenChange(next);
  };

  const start = async () => {
    if (!api?.ai || !providerId || !source) return;
    const requestId = crypto.randomUUID();
    setOutput('');
    setRun({ status: 'running', requestId });
    try {
      const result = await api.ai.runTurn({
        requestId,
        providerId,
        action,
        text: source.text,
        noteTitle: noteTitle || undefined,
        ...(action === 'translate' ? { targetLanguage } : {}),
      }, (delta) => {
        if (runRef.current.status === 'running' && runRef.current.requestId === requestId) {
          setOutput(current => current + delta);
        }
      });
      if (runRef.current.status !== 'running' || runRef.current.requestId !== requestId) return;
      setOutput(result.trim());
      setRun({ status: 'done' });
    } catch (error) {
      if (runRef.current.status !== 'running' || runRef.current.requestId !== requestId) return;
      setRun({ status: 'error', message: getAiErrorMessage(error) });
    }
  };

  const apply = () => {
    const result = output.trim();
    if (!result) return;
    if (onApply(APPLY_MODES[action], result)) {
      onOpenChange(false);
      return;
    }
    setRun({ status: 'error', message: 'The note changed while AI was working, so nothing was replaced. Copy the result instead.' });
  };

  const copy = () => {
    void writeClipboardText(api, output.trim())
      .then(() => toast.success('Copied AI result.'))
      .catch(error => toast.error(getAiErrorMessage(error)));
  };

  const running = run.status === 'running';
  const tooLong = (source?.text.length ?? 0) > MAX_AI_INPUT_CHARACTERS;
  const providerLabels = Object.fromEntries((providers ?? []).map(id => [id, AI_PROVIDER_TITLES[id]]));
  const actionLabels: Record<string, string> = AI_ACTION_LABELS;
  const scope = source?.isSelection ? 'the selected text' : 'this note';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md" className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Assist</DialogTitle>
          <DialogDescription>
            {providerId
              ? `Sends ${scope} to ${AI_PROVIDER_TITLES[providerId]} through the ${AI_PROVIDER_TITLES[providerId]} account signed in on this computer.`
              : `Works on ${scope}.`}
          </DialogDescription>
        </DialogHeader>

        {!api?.ai ? (
          <p className="text-sm text-text-subtle">AI Assist is available in the HackDesk desktop app.</p>
        ) : providers && providers.length === 0 ? (
          <p role="status" className="text-sm text-text-subtle">
            No AI provider is turned on. Open Settings › AI and turn on Codex or Claude.
          </p>
        ) : (
          <div className="space-y-4">
            {isTeamNote ? (
              <p className="rounded-md border border-warning-default/30 bg-warning-soft px-3 py-2 text-sm text-text-default">
                This is a team note. Its text may include other people&apos;s writing.
              </p>
            ) : null}
            {tooLong ? (
              <p role="alert" className="text-sm text-destructive-default">
                This text is too long for AI Assist. Select a shorter part of the note.
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-40 gap-1.5 text-sm">
                <label htmlFor="ai-assist-action" className="font-medium">Action</label>
                <Select
                  name="ai-assist-action"
                  value={action}
                  disabled={running}
                  onValueChange={(value) => {
                    if (typeof value !== 'string' || !(AI_ACTIONS as readonly string[]).includes(value)) return;
                    // A result belongs to the action that produced it.
                    setAction(value as AiAction);
                    setOutput('');
                    setRun({ status: 'idle' });
                  }}
                  items={AI_ACTIONS.map(value => ({ value, label: AI_ACTION_LABELS[value] }))}
                >
                  <SelectTrigger id="ai-assist-action" className="w-full">
                    <SelectLabelValue value={action} labels={actionLabels} />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_ACTIONS.map(value => <SelectItem key={value} value={value}>{AI_ACTION_LABELS[value]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {action === 'translate' ? (
                <div className="grid w-40 gap-1.5 text-sm">
                  <label htmlFor="ai-assist-language" className="font-medium">Into</label>
                  <Input
                    id="ai-assist-language"
                    value={targetLanguage}
                    maxLength={64}
                    disabled={running}
                    onChange={event => setTargetLanguage(event.target.value)}
                  />
                </div>
              ) : null}
              {providers && providers.length > 1 && providerId ? (
                <div className="grid min-w-32 gap-1.5 text-sm">
                  <label htmlFor="ai-assist-provider" className="font-medium">Provider</label>
                  <Select
                    name="ai-assist-provider"
                    value={providerId}
                    disabled={running}
                    onValueChange={(value) => {
                      if (typeof value === 'string' && providers.includes(value as AiProviderId)) setProviderId(value as AiProviderId);
                    }}
                    items={providers.map(id => ({ value: id, label: AI_PROVIDER_TITLES[id] }))}
                  >
                    <SelectTrigger id="ai-assist-provider" className="w-full">
                      <SelectLabelValue value={providerId} labels={providerLabels} />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map(id => <SelectItem key={id} value={id}>{AI_PROVIDER_TITLES[id]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {running ? (
                <Button variant="secondary" onClick={cancelRun}>
                  <Square aria-hidden="true" className="h-4 w-4" />
                  Stop
                </Button>
              ) : (
                <Button variant="primary" disabled={!providerId || !source?.text.trim() || tooLong} onClick={() => void start()}>
                  <Sparkles aria-hidden="true" className="h-4 w-4" />
                  {run.status === 'done' || run.status === 'error' ? 'Run Again' : 'Run'}
                </Button>
              )}
            </div>

            <div className={APPLY_MODES[action] === 'replace' ? 'grid min-h-0 gap-4 sm:grid-cols-2' : 'grid min-h-0 gap-4'}>
              {APPLY_MODES[action] === 'replace' ? (
                <section aria-label="Original" className="min-w-0 space-y-2">
                  <h3 className="text-sm font-medium">Original</h3>
                  <pre tabIndex={0} className="max-h-80 min-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-default bg-background-muted p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">{source?.text}</pre>
                </section>
              ) : null}
              <section aria-label="AI result" aria-busy={running} className="min-w-0 space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  {APPLY_MODES[action] === 'replace' ? 'AI result' : action === 'summarize' ? 'Summary' : 'Continuation'}
                  {running ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : null}
                </h3>
                <pre tabIndex={0} className="max-h-80 min-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-default bg-background-muted p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
                  {output || (running ? 'Waiting for the first words…' : '')}
                </pre>
              </section>
            </div>
            {run.status === 'error' ? <p role="alert" className="text-sm text-destructive-default">{run.message}</p> : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" disabled={running || !output.trim()} onClick={copy}>
            <Copy aria-hidden="true" className="h-4 w-4" />
            Copy
          </Button>
          <Button variant="primary" disabled={run.status !== 'done' || !output.trim()} onClick={apply}>
            {applyLabel(action, Boolean(source?.isSelection))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
