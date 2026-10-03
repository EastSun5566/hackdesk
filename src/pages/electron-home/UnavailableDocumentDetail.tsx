import { AlertCircle, Copy, Download, FilePlus, RefreshCw } from 'lucide-react';

import type { DocumentPaneView } from './DocumentWorkspace';
import { PanelHeader, PanelShell } from './interaction-primitives';

export type UnavailableDocumentDetailProps = {
  unavailable: NonNullable<DocumentPaneView['unavailable']>;
  title: string;
  content: string;
  onCopyDraft: (content: string) => void;
  onExportDraft: (title: string, content: string) => void;
  onOpenAsNewDraft: (title: string, content: string) => void;
  onRetry: () => void;
};

const buttonClassName = 'inline-flex h-7 items-center gap-1 rounded-[6px] border border-border-default bg-background-default px-2 text-xs font-medium text-text-default hover:bg-background-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50';

function getMessage({ kind, message, hasDraft }: UnavailableDocumentDetailProps['unavailable']) {
  const reason = kind === 'missing'
    ? `The original note is no longer available. ${message}`
    : `The original note could not be loaded. ${message}`;
  return hasDraft
    ? `${reason} Your unsaved draft is kept here until you close this tab. The original is never recreated or overwritten automatically.`
    : reason;
}

/** Shown instead of the editor when a saved note cannot be loaded, so a retained draft stays reachable. */
export function UnavailableDocumentDetail({
  unavailable,
  title,
  content,
  onCopyDraft,
  onExportDraft,
  onOpenAsNewDraft,
  onRetry,
}: UnavailableDocumentDetailProps) {
  return (
    <PanelShell className="h-full min-w-0 flex-1 bg-background-default">
      <PanelHeader
        className="px-4 py-2.5"
        titleElement="div"
        title={title || 'Untitled'}
        subtitle={unavailable.kind === 'missing' ? 'Original note unavailable' : 'Could not load note'}
      />
      <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-warning-default/30 bg-warning-soft px-4 py-2.5 text-sm">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-warning-default" />
        <p className="min-w-0 flex-1 text-text-default">{getMessage(unavailable)}</p>
        {unavailable.kind === 'read_error' ? (
          <button type="button" className={buttonClassName} disabled={unavailable.isRetrying} onClick={onRetry}>
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            {unavailable.isRetrying ? 'Retrying…' : 'Retry'}
          </button>
        ) : null}
      </div>
      {unavailable.hasDraft ? (
        <section aria-label="Unsaved draft" className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClassName} onClick={() => onCopyDraft(content)}>
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              Copy draft
            </button>
            <button type="button" className={buttonClassName} onClick={() => onExportDraft(title, content)}>
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              Export draft
            </button>
            <button type="button" className={buttonClassName} onClick={() => onOpenAsNewDraft(title, content)}>
              <FilePlus aria-hidden="true" className="h-3.5 w-3.5" />
              Open as new draft
            </button>
          </div>
          <pre
            tabIndex={0}
            aria-label="Draft content"
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-default bg-background-muted p-3 text-sm text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
          >
            {content}
          </pre>
        </section>
      ) : null}
    </PanelShell>
  );
}
