import { useRef, useState, type RefObject } from 'react';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { searchSettings, type SettingsSearchResult } from './settings-search';
import { SETTINGS_TABS } from './SettingsDialogConfig';
import { FOCUS_RING_CLASS } from './ui';

export function SettingsTabs({ dialogRef, onNavigate }: {
  dialogRef: RefObject<HTMLDivElement | null>;
  onNavigate: (result: SettingsSearchResult) => void;
}) {
  const [search, setSearch] = useState({ query: '', results: [] as SettingsSearchResult[] });
  const resultsRef = useRef<HTMLDivElement>(null);
  const choose = (result: SettingsSearchResult) => {
    setSearch({ query: '', results: [] });
    onNavigate(result);
  };

  return (
    <aside aria-label="Settings sidebar" className="flex min-h-0 w-48 shrink-0 self-stretch flex-col gap-3 border-r border-border-default bg-background-muted/40 p-3">
      <Input
        autoFocus
        aria-label="Search settings"
        placeholder="Search settings"
        value={search.query}
        onChange={event => {
          const query = event.target.value;
          setSearch({ query, results: dialogRef.current ? searchSettings(dialogRef.current, query) : [] });
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            if (search.results[0]) choose(search.results[0]);
          } else if (event.key === 'ArrowDown' && search.query.trim()) {
            event.preventDefault();
            resultsRef.current?.querySelector('button')?.focus();
          } else if (event.key === 'Escape' && search.query) {
            event.preventDefault();
            event.stopPropagation();
            setSearch({ query: '', results: [] });
          }
        }}
      />
      {search.query.trim() ? (
        <div ref={resultsRef} aria-label="Settings search results" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {search.results.map(result => (
            <Button
              key={result.id}
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-start"
              aria-label={`${result.label}, ${result.section}`}
              onClick={() => choose(result)}
            >
              <span className="flex min-w-0 flex-col items-start py-1">
                <span className="max-w-full truncate">{result.label}</span>
                <span className="text-xs text-text-subtle">{result.section}</span>
              </span>
            </Button>
          ))}
          {!search.results.length ? <p role="status" className="text-xs text-text-subtle">No settings found.</p> : null}
        </div>
      ) : (
        <TabsList
          activateOnFocus
          aria-label="Settings sections"
          className="flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto"
        >
          {SETTINGS_TABS.map(tab => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'inline-flex h-10 w-full min-w-0 shrink-0 items-center justify-start gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-element-bg-hover',
                FOCUS_RING_CLASS,
                'text-text-subtle data-[selected]:bg-background-default data-[selected]:text-text-default data-[selected]:shadow-sm',
              )}
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      )}
    </aside>
  );
}
