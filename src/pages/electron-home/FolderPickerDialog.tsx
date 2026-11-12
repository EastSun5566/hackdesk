import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CornerUpLeft, FolderOpen, FolderPlus, Home, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { toast } from '@/components/ui/toast';
import type { HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalDirectoryBrowseResult } from '@/lib/local-vault';
import { cn } from '@/lib/utils';

export type FolderPickerDialogProps = {
  api?: HackDeskElectronAPI;
  open: boolean;
  initialPath?: string | null;
  /** Folders already in the vault list, marked so they aren't added twice by mistake. */
  addedPaths?: readonly string[];
  onOpenChange: (open: boolean) => void;
  onChoose: (path: string) => void;
};

function splitPath(path: string) {
  const separator = path.includes('\\') ? '\\' : '/';
  const absolute = path.startsWith(separator) || /^[A-Za-z]:/.test(path);
  const segments = path.split(/[\\/]+/).filter((segment) => segment.length > 0);
  const crumbs = segments.map((_, index) => {
    const prefix = absolute && separator === '/' ? separator : '';
    return `${prefix}${segments.slice(0, index + 1).join(separator)}`;
  });
  return { crumbs, labels: segments };
}

function currentName(path: string) {
  const segments = path.split(/[\\/]+/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? path;
}

export function FolderPickerDialog({ api, open, initialPath, addedPaths = [], onOpenChange, onChoose }: FolderPickerDialogProps) {
  const [listing, setListing] = useState<LocalDirectoryBrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const generation = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const browse = useCallback(async (path?: string | null) => {
    if (!api) {
      setError('Electron API is unavailable.');
      return;
    }
    const request = generation.current + 1;
    generation.current = request;
    setLoading(true);
    setError(null);
    try {
      const result = await api.localVault.browse(path ?? undefined);
      if (generation.current !== request) {
        return;
      }
      setListing(result);
      setFilter('');
      setHighlight(0);
      setCreating(false);
      setNewName('');
    } catch (requestError) {
      if (generation.current !== request) {
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'That folder cannot be opened.');
    } finally {
      if (generation.current === request) {
        setLoading(false);
      }
    }
  }, [api]);

  useEffect(() => {
    if (open) {
      generation.current += 1;
      setListing(null);
      void browse(initialPath ?? undefined);
      window.requestAnimationFrame(() => filterRef.current?.focus());
    }
  }, [open, initialPath, browse]);

  const entries = useMemo(() => {
    const query = filter.trim().toLowerCase();
    // Dot-folders (.git, .hackdesk, .config) are rarely a vault; typing a "." brings them back.
    const visible = (listing?.entries ?? []).filter((entry) => query.startsWith('.') || !entry.name.startsWith('.'));
    return query ? visible.filter((entry) => entry.name.toLowerCase().includes(query)) : visible;
  }, [filter, listing]);
  const added = useMemo(() => new Set(addedPaths), [addedPaths]);

  const hasUpRow = Boolean(listing?.parent);
  // While filtering, the parent row steps aside so Enter opens the highlighted match.
  const showUpRow = hasUpRow && !filter.trim();
  // Row 0 is the parent folder when one is shown, then one row per listed folder.
  const rowCount = entries.length + (showUpRow ? 1 : 0);
  const clampedHighlight = rowCount === 0 ? 0 : Math.min(highlight, rowCount - 1);

  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [clampedHighlight, listing?.path]);

  const descend = useCallback((path: string) => {
    void browse(path);
  }, [browse]);

  const goUp = useCallback(() => {
    if (listing?.parent) {
      descend(listing.parent);
    }
  }, [descend, listing?.parent]);

  const activateRow = useCallback((index: number) => {
    if (showUpRow && index === 0) {
      goUp();
      return;
    }
    const entry = entries[showUpRow ? index - 1 : index];
    if (entry) {
      descend(entry.path);
    }
  }, [descend, entries, goUp, showUpRow]);

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (loading || error || !listing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rowCount === 0) {
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight(((clampedHighlight + step) % rowCount + rowCount) % rowCount);
    } else if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      activateRow(clampedHighlight);
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      const selected = entries[showUpRow ? clampedHighlight - 1 : clampedHighlight];
      onChoose(selected?.path ?? listing.path);
    } else if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && !creating) {
      event.preventDefault();
      goUp();
    }
  };

  const createFolder = async () => {
    const name = newName.trim();
    if (!api || !listing || !name || creatingFolder) {
      return;
    }
    setCreatingFolder(true);
    try {
      await api.localVault.createDirectory({ parentPath: listing.path, name });
      await browse(listing.path);
      setFilter(name);
      window.requestAnimationFrame(() => filterRef.current?.focus());
      toast.success('Folder created.', { description: name });
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'That folder could not be created.');
    } finally {
      setCreatingFolder(false);
    }
  };

  const { crumbs, labels } = useMemo(() => (listing ? splitPath(listing.path) : { crumbs: [], labels: [] as string[] }), [listing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md" onKeyDown={(event) => {
          if (!event.defaultPrevented && event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !creating && listing && !loading && !error) {
            event.preventDefault();
            const selected = entries[showUpRow ? clampedHighlight - 1 : clampedHighlight];
            onChoose(selected?.path ?? listing.path);
          }
        }}>
        <DialogHeader>
          <DialogTitle>Choose a Vault Folder</DialogTitle>
          <DialogDescription>
            Open the folder that holds your Markdown files, then choose it. You confirm it once before HackDesk reads it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Go to the home folder"
            disabled={loading || !listing}
            onClick={() => listing && descend(listing.home)}
          >
            <Home aria-hidden="true" className="size-4" />
          </Button>
          <nav aria-label="Current folder" className="flex h-8 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded border border-border-default bg-background-muted px-1.5 py-1 text-xs">
            {crumbs.map((crumb, index) => (
              <span key={crumb} className="flex shrink-0 items-center gap-0.5">
                {index > 0 ? <span aria-hidden="true" className="text-text-subtle">/</span> : null}
                <button
                  type="button"
                  onClick={() => descend(crumb)}
                  aria-current={index === crumbs.length - 1 ? 'location' : undefined}
                  className={cn(
                    'max-w-32 truncate rounded px-1 py-0.5 hover:bg-element-bg-hover hover:text-text-default',
                    index === crumbs.length - 1 ? 'font-semibold text-text-default' : 'text-text-subtle',
                  )}
                >
                  {labels[index]}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-icon-default" />
          <Input
            ref={filterRef}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setHighlight(0);
            }}
            placeholder="Filter folders…"
            aria-label="Filter folders"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={!loading && !error && rowCount ? `${listId}-row-${clampedHighlight}` : undefined}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter'
                || (event.key === 'Backspace' && !filter)) {
                onListKeyDown(event);
                if (event.defaultPrevented) event.stopPropagation();
              }
            }}
            autoComplete="off"
            spellCheck={false}
            className="pl-8"
          />
        </div>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Folders"
          tabIndex={0}
          onKeyDown={onListKeyDown}
          aria-activedescendant={!loading && !error && rowCount ? `${listId}-row-${clampedHighlight}` : undefined}
          className="h-64 overflow-y-auto rounded border border-border-default outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {loading && !listing ? (
            <p role="status" className="flex items-center gap-2 px-3 py-6 text-sm text-text-subtle">
              <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              Listing folders…
            </p>
          ) : error ? (
            <div className="px-3 py-6 text-sm">
              <p role="alert" className="text-state-danger-text">{error}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => { void browse(listing?.path ?? initialPath ?? undefined); }}>
                Try again
              </Button>
            </div>
          ) : rowCount === 0 ? (
            <p role="status" className="px-3 py-6 text-sm text-text-subtle">
              {filter.trim() ? 'No folders match.' : 'No folders here yet.'}
            </p>
          ) : (
            <ul className="list-none p-1.5">
              {showUpRow ? (
                <li>
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-row-0`}
                    tabIndex={-1}
                    aria-selected={clampedHighlight === 0}
                    data-highlighted={clampedHighlight === 0 || undefined}
                    onClick={goUp}
                    onMouseMove={() => setHighlight(0)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                      clampedHighlight === 0 ? 'bg-background-primary-subtler text-text-emphasize' : 'text-text-default hover:bg-element-bg-hover',
                    )}
                  >
                    <CornerUpLeft aria-hidden="true" className="size-3.5 shrink-0 text-text-subtle" />
                    <span className="min-w-0 truncate">Parent folder</span>
                  </button>
                </li>
              ) : null}
              {entries.map((entry, index) => {
                const row = showUpRow ? index + 1 : index;
                const highlighted = clampedHighlight === row;
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-row-${row}`}
                      tabIndex={-1}
                      aria-selected={highlighted}
                      data-highlighted={highlighted || undefined}
                      aria-description={added.has(entry.path) ? 'Already added' : undefined}
                      onClick={() => descend(entry.path)}
                      onMouseMove={() => setHighlight(row)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                        highlighted ? 'bg-background-primary-subtler text-text-emphasize' : 'text-text-default hover:bg-element-bg-hover',
                      )}
                    >
                      <FolderOpen aria-hidden="true" className="size-3.5 shrink-0 text-text-subtle" />
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      {added.has(entry.path) ? <span aria-hidden="true" className="shrink-0 rounded-full bg-background-muted px-2 text-xs leading-5 text-text-subtle">Added</span> : null}
                      {loading ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {creating ? (
          <form
            className="flex h-9 items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void createFolder();
            }}
          >
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New folder name"
              aria-label="New folder name"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <Button type="submit" variant="primary" size="sm" disabled={!newName.trim() || creatingFolder}>
              {creatingFolder ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
              Create
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setCreating(false); setNewName(''); }}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex h-9 items-center justify-between gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || !listing}
              onClick={() => setCreating(true)}
            >
              <FolderPlus aria-hidden="true" className="size-3.5" />
              New Folder
            </Button>
            <p className="text-xs text-text-subtle">↑↓ move · Enter opens · ⌫ goes up · ⌘↵ adds</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!listing || loading || !!error} onClick={() => listing && onChoose(listing.path)}>
            Choose {listing ? `“${currentName(listing.path)}”` : 'Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useFolderPicker(api: HackDeskElectronAPI | undefined) {
  const [open, setOpen] = useState(false);
  const [initialPath, setInitialPath] = useState<string | null>(null);
  const [addedPaths, setAddedPaths] = useState<readonly string[]>([]);
  const resolveRef = useRef<((path: string | null) => void) | null>(null);

  const pickFolder = useCallback((startPath?: string | null, added: readonly string[] = []) => new Promise<string | null>((resolve) => {
    // A second request replaces the first: the earlier caller resumes with no folder.
    resolveRef.current?.(null);
    resolveRef.current = resolve;
    setInitialPath(startPath ?? null);
    setAddedPaths(added);
    setOpen(true);
  }), []);

  const settle = useCallback((path: string | null) => {
    setOpen(false);
    resolveRef.current?.(path);
    resolveRef.current = null;
  }, []);

  const dialog = (
    <FolderPickerDialog
      api={api}
      open={open}
      initialPath={initialPath}
      addedPaths={addedPaths}
      onOpenChange={(next) => {
        if (!next) {
          settle(null);
        }
      }}
      onChoose={settle}
    />
  );

  return { dialog, pickFolder };
}
