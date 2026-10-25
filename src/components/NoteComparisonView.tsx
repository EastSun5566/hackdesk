import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { getHackDeskAPI } from '@/lib/electron-api';
import { writeClipboardText } from '@/lib/clipboard';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { comparisonTooLarge, type NoteComparison } from '@/lib/note-comparison';

const PierreComparison = lazy(() => import('./PierreComparison'));

class ComparisonBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; input: NoteComparison },
  { failed: boolean; input: NoteComparison }
> {
  state = { failed: false, input: this.props.input };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: { input: NoteComparison }, state: { input: NoteComparison }) {
    return props.input !== state.input ? { failed: false, input: props.input } : null;
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function PlainComparison({ input, beforeLabel, afterLabel, reason }: ComparisonProps & { reason?: string }) {
  const sections = input.kind === 'patch'
    ? [{ id: 'patch', label: 'Original patch', text: input.patch }]
    : [{ id: 'before', label: beforeLabel, text: input.before }, { id: 'after', label: afterLabel, text: input.after }];
  return (
    <div className="space-y-3">
      {reason ? <p role="status" className="text-sm text-text-subtle">{reason}</p> : null}
      {sections.map(({ id, label, text }) => {
        const copyLabel = input.kind === 'patch' ? 'Copy full text' : `Copy ${label}`;
        const preview = text.slice(0, 64_000).split('\n').slice(0, 500).join('\n');
        return (
          <section key={id} aria-label={label}>
            <h3 className="mb-1 text-sm font-medium">{label}</h3>
            <Button
              size="xs" variant="secondary" className="mb-2"
              onClick={() => {
                void writeClipboardText(getHackDeskAPI(), text).then(
                  () => toast.success('Copied original text.'),
                  () => toast.error('Could not copy text.'),
                );
              }}
            >
              {copyLabel}
            </Button>
            <pre
              role="document" aria-label={`${label} text`} tabIndex={0}
              className="comparison-text-preview overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-default p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-focus-ring"
            >{preview}</pre>
            {preview.length < text.length ? (
              <p className="text-xs text-text-subtle">Text preview is limited. Copy full text to read everything.</p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export type ComparisonProps = { input: NoteComparison; beforeLabel: string; afterLabel: string };

export function NoteComparisonView(props: ComparisonProps) {
  const [plain, setPlain] = useState(false);
  const oversized = comparisonTooLarge(props.input);
  const fallback = <PlainComparison {...props} reason="Could not render this comparison. The original text is available below." />;
  return <div className="min-w-0 space-y-3" data-note-comparison>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-subtle">
      <span>{props.beforeLabel} → {props.afterLabel} · − Removed / + Added</span>
      {!oversized ? <Button size="xs" variant="ghost" onClick={() => setPlain(!plain)}>{plain ? 'Show changes' : 'Plain text'}</Button> : null}
    </div>
    {oversized || plain ? <PlainComparison {...props} reason={oversized ? 'This comparison exceeds 5,000 lines or 1 MiB. Showing a limited text preview.' : undefined} /> :
      <ComparisonBoundary fallback={fallback} input={props.input}>
        <Suspense fallback={<p className="text-sm text-text-subtle">Loading comparison…</p>}>
          <PierreComparison {...props} />
        </Suspense>
      </ComparisonBoundary>}
  </div>;
}
