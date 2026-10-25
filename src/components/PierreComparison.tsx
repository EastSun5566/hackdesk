import { useEffect, useMemo, useRef, useState } from 'react';
import { createCSSVariablesTheme, registerCustomTheme } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs/react';
import { Button } from '@/components/ui/button';
import { parseNoteComparison } from '@/lib/parse-note-comparison';
import type { ComparisonProps } from './NoteComparisonView';

registerCustomTheme('hackdesk', async () => createCSSVariablesTheme({ name: 'hackdesk', variablePrefix: '--comparison-' }), 'diffs');

const themeCSS = `
:host {
  --comparison-foreground: var(--text-default);
  --comparison-background: var(--background-default);
  --diffs-font-family: var(--font-editor);
  --diffs-font-size: var(--font-size-editor);
  --diffs-fg-number-override: var(--text-subtle);
  --diffs-addition-color-override: var(--success-default);
  --diffs-deletion-color-override: var(--destructive-default);
  --diffs-bg-addition-override: var(--success-soft);
  --diffs-bg-deletion-override: var(--destructive-soft);
  --diffs-bg-addition-number-override: var(--success-soft);
  --diffs-bg-deletion-number-override: var(--destructive-soft);
  --diffs-bg-addition-emphasis-override: var(--success-soft);
  --diffs-bg-deletion-emphasis-override: var(--destructive-soft);
  --diffs-bg-separator-override: var(--background-muted);
  --diffs-bg-buffer-override: var(--background-default);
}
[data-diffs], [data-code] { color: var(--text-default); }
` + ['comment', 'string-expression', 'string', 'keyword', 'constant', 'parameter', 'function', 'punctuation', 'link', 'inserted', 'deleted']
  .map((token) => `:host { --comparison-token-${token}: var(${token === 'comment' ? '--code-comment' : token === 'keyword' ? '--code-keyword' : token.startsWith('string') ? '--code-string' : '--text-default'}); }`).join('\n');

export default function PierreComparison({ input, beforeLabel, afterLabel }: ComparisonProps) {
  const root = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [split, setSplit] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 720));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const files = useMemo(() => parseNoteComparison(input), [input]);
  if (failed) throw new Error('Comparison rendering failed.');
  const changed = files.some((file) => file.hunks.some((hunk) => hunk.hunkContent.some((part) => part.type === 'change')));
  return <div ref={root}>
    {wide && changed ? <Button size="xs" variant="secondary" className="mb-2" aria-pressed={split} onClick={() => setSplit(!split)}>Split view</Button> : null}
    {!changed ? <p className="py-6 text-center text-sm text-text-subtle">No changes.</p> : files.map((file, index) =>
      <div key={index} role="region" aria-label={`${beforeLabel} compared with ${afterLabel}`} tabIndex={0}
        className="min-w-0 overflow-hidden rounded-md border border-border-default focus-visible:outline-2 focus-visible:outline-focus-ring">
        <FileDiff fileDiff={file} disableWorkerPool options={{
          onPostRender: (node, _instance, phase) => {
            if (phase !== 'unmount' && node.shadowRoot?.querySelector('[data-error-wrapper]')) setFailed(true);
          },
          theme: 'hackdesk', preferredHighlighter: 'shiki-js', unsafeCSS: themeCSS,
          diffStyle: wide && split ? 'split' : 'unified', overflow: 'wrap',
          disableFileHeader: true, diffIndicators: 'classic', hunkSeparators: 'line-info',
          maxLineDiffLength: 1_000, tokenizeMaxLineLength: 1_000,
        }} />
      </div>)}
  </div>;
}
