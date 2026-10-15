import { Loader2, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import type { NoteVersionSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { formatDate } from './ui';

export const CURRENT_VERSION_ID = 'current';

export function getVersionTitle(version: NoteVersionSummary) {
  return version.nameSource === 'user' && version.name ? version.name : 'Auto-saved';
}

export function getVersionByline(version: NoteVersionSummary) {
  const date = formatDate(version.createdAtMillis);
  return version.createdBy ? `${version.createdBy.displayName} · ${date}` : date;
}

function VersionRow({
  selected,
  title,
  detail,
  named,
  onSelect,
}: {
  selected: boolean;
  title: string;
  detail: string;
  named?: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      {/* A plain button keeps every row in the tab order; aria-current marks the one shown. */}
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        className={cn(
          'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-element-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          selected && 'bg-background-selected',
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5 text-sm font-medium text-text-default">
          {named ? <Star aria-hidden="true" className="size-3.5 shrink-0 fill-current text-warning-default" /> : null}
          <span className="truncate">{title}</span>
        </span>
        <span className="w-full truncate text-xs text-text-subtle">{detail}</span>
      </button>
    </li>
  );
}

export function NoteVersionList({
  versions,
  selectedId,
  currentDetail,
  namedOnly,
  hasMore,
  loadingMore,
  onSelect,
  onNamedOnlyChange,
  onLoadMore,
}: {
  versions: NoteVersionSummary[];
  selectedId: string;
  currentDetail: string;
  namedOnly: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onSelect: (id: string) => void;
  onNamedOnlyChange: (namedOnly: boolean) => void;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex min-h-0 shrink-0 flex-col gap-2 sm:w-60">
      <Toggle size="sm" pressed={namedOnly} onPressedChange={onNamedOnlyChange} className="self-start">
        Named only
      </Toggle>
      <ul aria-label="Versions" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
        <VersionRow
          selected={selectedId === CURRENT_VERSION_ID}
          title="Current"
          detail={currentDetail}
          onSelect={() => onSelect(CURRENT_VERSION_ID)}
        />
        {versions.map((version) => (
          <VersionRow
            key={version.id}
            selected={selectedId === version.id}
            title={getVersionTitle(version)}
            detail={getVersionByline(version)}
            named={version.nameSource === 'user'}
            onSelect={() => onSelect(version.id)}
          />
        ))}
      </ul>
      {hasMore ? (
        <Button size="sm" variant="ghost" aria-busy={loadingMore || undefined} disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
          Load more
        </Button>
      ) : null}
    </div>
  );
}
