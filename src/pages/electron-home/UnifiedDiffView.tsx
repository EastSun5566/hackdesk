import { useMemo } from 'react';

import { parseUnifiedDiff, type DiffLine } from '@/lib/unified-diff';
import { cn } from '@/lib/utils';

const LINE_CLASS_NAMES: Record<DiffLine['kind'], string> = {
  hunk: 'bg-background-muted text-text-subtle',
  add: 'bg-success-soft text-success-default',
  remove: 'bg-destructive-soft text-destructive-default',
  context: 'text-text-default',
};

const LINE_MARKERS: Record<DiffLine['kind'], string> = { hunk: '', add: '+', remove: '-', context: ' ' };
const LINE_LABELS: Partial<Record<DiffLine['kind'], string>> = { add: 'Added: ', remove: 'Removed: ' };

/** Renders a unified diff as colored lines. Screen readers hear "Added"/"Removed" instead of +/-. */
export function UnifiedDiffView({ diff, label }: { diff: string; label: string }) {
  const { lines, truncated } = useMemo(() => parseUnifiedDiff(diff), [diff]);

  if (lines.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-text-subtle">No changes since this version.</p>;
  }

  return (
    <div className="min-w-0">
      <ol aria-label={label} className="overflow-x-auto rounded-md border border-border-default font-mono text-xs leading-5">
        {lines.map((line, index) => (
          <li key={index} className={cn('flex min-w-max gap-3 px-3', LINE_CLASS_NAMES[line.kind])}>
            {line.kind === 'hunk' ? (
              <span>{line.text}</span>
            ) : (
              <>
                <span aria-hidden="true" className="w-8 shrink-0 select-none text-right text-text-subtle">
                  {line.newLine ?? line.oldLine}
                </span>
                <span aria-hidden="true" className="w-2 shrink-0 select-none">{LINE_MARKERS[line.kind]}</span>
                <span className="whitespace-pre">
                  {LINE_LABELS[line.kind] ? <span className="sr-only">{LINE_LABELS[line.kind]}</span> : null}
                  {line.text || ' '}
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      {truncated ? (
        <p className="mt-2 text-xs text-text-subtle">This comparison is too long to show in full. Open the full text to see the rest.</p>
      ) : null}
    </div>
  );
}
