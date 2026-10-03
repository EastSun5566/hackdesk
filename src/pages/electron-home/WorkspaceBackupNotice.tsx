import { AlertCircle, Copy, Download, RefreshCw } from 'lucide-react';

export type WorkspaceBackupNoticeProps = {
  currentWorkspaceAffected: boolean;
  hasActiveDraft: boolean;
  otherWorkspaceAffected: boolean;
  onCopyDraft: () => void;
  onExportDraft: () => void;
  onRetry: () => void;
};

const buttonClassName = 'inline-flex h-7 items-center gap-1 rounded-[6px] border border-warning-default/35 bg-background-default px-2 text-xs font-medium text-text-default hover:bg-background-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50';

export function WorkspaceBackupNotice({
  currentWorkspaceAffected,
  hasActiveDraft,
  otherWorkspaceAffected,
  onCopyDraft,
  onExportDraft,
  onRetry,
}: WorkspaceBackupNoticeProps) {
  return (
    <div role="alert" className="shrink-0 border-b border-warning-default/30 bg-warning-soft px-4 py-2.5 text-sm text-warning-default">
      <div className="flex flex-wrap items-center gap-2">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 text-text-default">
          {currentWorkspaceAffected
            ? `Workspace backup failed. Your drafts are still open, but they will be lost if HackDesk quits before a backup succeeds.${otherWorkspaceAffected ? ' Another workspace is also not backed up.' : ''}`
            : 'Another workspace could not be backed up. Its drafts will be lost if HackDesk quits before a backup succeeds. Switch to it to copy or export them.'}
        </p>
        {currentWorkspaceAffected ? (
          <>
            <button
              type="button"
              className={buttonClassName}
              disabled={!hasActiveDraft}
              title={hasActiveDraft ? undefined : 'The active tab has no unsaved draft.'}
              onClick={onCopyDraft}
            >
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              Copy draft
            </button>
            <button
              type="button"
              className={buttonClassName}
              disabled={!hasActiveDraft}
              title={hasActiveDraft ? undefined : 'The active tab has no unsaved draft.'}
              onClick={onExportDraft}
            >
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              Export draft
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-[6px] bg-warning-default px-2 text-xs font-medium text-background-default hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={onRetry}
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Retry backup
        </button>
      </div>
    </div>
  );
}
