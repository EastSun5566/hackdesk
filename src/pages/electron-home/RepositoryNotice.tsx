import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export function RepositoryNotice({
  error,
  cached,
}: {
  error: string | null;
  cached: boolean;
}) {
  if (!error) {
    return null;
  }

  return (
    <div
      role={cached ? 'status' : 'alert'}
      aria-atomic="true"
      className={cn(
        'flex items-start gap-2 rounded-md px-3 py-2 text-sm',
        cached
          ? 'bg-primary-soft text-primary-default'
          : 'bg-destructive-soft text-destructive-default',
      )}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{cached ? `Cached data. ${error}` : error}</span>
    </div>
  );
}
