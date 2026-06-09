import { AlertCircle } from 'lucide-react';

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
    <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
      cached
        ? 'bg-primary-soft text-primary-default'
        : 'bg-destructive-soft text-destructive-default'
    }`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{cached ? `Showing cached data. ${error}` : error}</span>
    </div>
  );
}
