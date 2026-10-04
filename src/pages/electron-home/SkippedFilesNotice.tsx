import { AlertCircle } from 'lucide-react';

import type { LocalVaultSkippedFile } from '@/lib/local-vault';

/** Lists vault files the scan left out, so a missing note is not a mystery. */
export function SkippedFilesNotice({ files }: { files?: LocalVaultSkippedFile[] }) {
  if (!files?.length) {
    return null;
  }

  return (
    <div role="status" aria-atomic="true" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-text-default">
      <p className="flex items-start gap-2">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-default" />
        <span>{files.length === 1 ? '1 file was not loaded.' : `${files.length} files were not loaded.`}</span>
      </p>
      <ul aria-label="Files not loaded" className="mt-1 max-h-24 space-y-0.5 overflow-y-auto pl-6 text-xs text-text-subtle">
        {files.map((file) => (
          <li key={file.relativePath} className="break-words">
            <span className="text-text-default">{file.relativePath}</span>
            {` — ${file.reason}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
