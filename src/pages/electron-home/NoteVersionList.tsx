import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import type { NoteVersionSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { formatDate } from './ui';

export const CURRENT_VERSION_ID = 'current';

export type VersionKind = 'current' | 'named' | 'auto';

export function getVersionKind(version: NoteVersionSummary): VersionKind {
  return version.nameSource === 'user' ? 'named' : 'auto';
}

/** The same dot as the tab status indicator: green for the live note, filled for named versions, hollow for auto-saves. */
export function VersionDot({ kind }: { kind: VersionKind }) {
  return (
    <span
      aria-hidden="true"
      data-version-kind={kind}
      className={cn(
        'size-2.5 shrink-0 rounded-full border',
        kind === 'current' && 'border-success-default bg-success-default',
        kind === 'named' && 'border-primary-default bg-primary-default',
        kind === 'auto' && 'border-text-subtle bg-background-default',
      )}
    />
  );
}

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
  kind,
  onSelect,
}: {
  selected: boolean;
  title: string;
  detail: string;
  kind: VersionKind;
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
          <VersionDot kind={kind} />
          <span className="truncate">{title}</span>
        </span>
        {/* Indented past the dot so the byline lines up with the title. */}
        <span className="w-full truncate pl-4 text-xs text-text-subtle">{detail}</span>
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
          kind="current"
          onSelect={() => onSelect(CURRENT_VERSION_ID)}
        />
        {versions.map((version) => (
          <VersionRow
            key={version.id}
            selected={selectedId === version.id}
            title={getVersionTitle(version)}
            detail={getVersionByline(version)}
            kind={getVersionKind(version)}
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
