import { useEffect, useState } from 'react';
import { NoteComparisonView } from '@/components/NoteComparisonView';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DocumentSummary } from '@/lib/electron-api';

type Source = { title: string; content: string; readAt: number };

export function ConflictComparison(props: {
  document: DocumentSummary; draftTitle: string; draftContent: string; source: string; onClose: () => void;
  readSource?: (document: DocumentSummary, signal: AbortSignal) => Promise<{ title: string; content: string }>;
}) {
  // Freeze both inputs for this opening; retries read only the source again.
  const [snapshot] = useState(props);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        if (!snapshot.readSource) throw new Error('Could not read the latest source.');
        const next = await snapshot.readSource(snapshot.document, controller.signal);
        if (!controller.signal.aborted) setResult({ ...next, readAt: Date.now() });
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not read the latest source.');
      }
    };
    void load();
    return () => controller.abort();
  }, [snapshot, attempt]);
  const beforeLabel = snapshot.source === 'HackMD' ? 'On HackMD' : 'On disk';
  return <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
    <DialogContent size="xl" className="flex note-comparison-dialog flex-col overflow-hidden">
      <DialogHeader className="shrink-0 pr-7">
        <DialogTitle>Compare with {snapshot.source}</DialogTitle>
        <DialogDescription>Review the latest saved content and your draft. Comparing does not save or reload either version.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-auto">
        {error ? <div className="space-y-2"><p role="status">{error}</p><Button size="sm" variant="secondary" onClick={() => { setError(null); setResult(null); setAttempt(attempt + 1); }}>Retry</Button></div> : !result ? <p className="text-sm text-text-subtle">Reading latest content…</p> : <>
          <p className="mb-3 text-xs text-text-subtle">Read from {snapshot.source} at {new Date(result.readAt).toLocaleTimeString()}.</p>
          {result.title !== snapshot.draftTitle ? <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="font-medium">{beforeLabel} title</dt><dd className="break-words">{result.title}</dd></div>
            <div><dt className="font-medium">Your draft title</dt><dd className="break-words">{snapshot.draftTitle}</dd></div>
          </dl> : null}
          <NoteComparisonView input={{ kind: 'text', before: result.content, after: snapshot.draftContent }} beforeLabel={beforeLabel} afterLabel="Your draft" />
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}
