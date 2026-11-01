import { useEffect, useRef, useState, type RefObject } from 'react';
import { Input } from '@/components/ui/field';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { searchSettings, type SettingsSearchResult } from './settings-search';
import { SETTINGS_TABS } from './SettingsDialogConfig';
import { FOCUS_RING_CLASS } from './ui';

const RESULTS_ID = 'settings-search-results';
const resultId = (index: number) => `settings-search-result-${index}`;

export function SettingsTabs({ dialogRef, onNavigate }: {
  dialogRef: RefObject<HTMLDivElement | null>;
  onNavigate: (result: SettingsSearchResult) => void;
}) {
  // Focus stays in the search box; Up and Down move the highlighted result, as in the command palette.
  const [search, setSearch] = useState({ query: '', results: [] as SettingsSearchResult[], active: 0 });
  const resultsRef = useRef<HTMLDivElement>(null);
  const choose = (result: SettingsSearchResult) => {
    setSearch({ query: '', results: [], active: 0 });
    onNavigate(result);
  };
  const showingResults = Boolean(search.query.trim());
  const activeResult = search.results[search.active];
  useEffect(() => {
    resultsRef.current?.querySelector(`#${resultId(search.active)}`)?.scrollIntoView({ block: 'nearest' });
  }, [search.active, search.results]);

  return (
    <aside aria-label="Settings sidebar" className="flex min-h-0 w-48 shrink-0 self-stretch flex-col gap-3 bg-background-muted/40 p-3">
      <Input
        autoFocus
        aria-label="Search settings"
        placeholder="Search settings"
        role="combobox"
        aria-expanded={showingResults}
        aria-controls={showingResults ? RESULTS_ID : undefined}
        aria-activedescendant={showingResults && activeResult ? resultId(search.active) : undefined}
        aria-autocomplete="list"
        value={search.query}
        onChange={event => {
          const query = event.target.value;
          setSearch({ query, results: dialogRef.current ? searchSettings(dialogRef.current, query) : [], active: 0 });
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          const step = event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n') ? 1
            : event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p') ? -1 : 0;
          if (event.key === 'Enter') {
            event.preventDefault();
            if (activeResult) choose(activeResult);
          } else if (step && search.results.length) {
            event.preventDefault();
            setSearch(current => ({ ...current, active: (current.active + step + current.results.length) % current.results.length }));
          } else if (event.key === 'Escape' && search.query) {
            event.preventDefault();
            event.stopPropagation();
            setSearch({ query: '', results: [], active: 0 });
          }
        }}
      />
      {showingResults ? (
        <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto">
          {search.results.length ? (
            <div id={RESULTS_ID} role="listbox" aria-label="Settings search results" className="space-y-1">
              {search.results.map((result, index) => (
                <div
                  key={result.id}
                  id={resultId(index)}
                  role="option"
                  aria-selected={index === search.active}
                  aria-label={`${result.label}, ${result.section}`}
                  onPointerMove={() => { if (index !== search.active) setSearch(current => ({ ...current, active: index })); }}
                  onPointerDown={event => event.preventDefault()}
                  onClick={() => choose(result)}
                  className={cn(
                    'flex min-w-0 cursor-default flex-col items-start rounded-md px-3 py-1.5 text-sm text-text-default',
                    index === search.active ? 'bg-background-selected' : 'hover:bg-element-bg-hover',
                  )}
                >
                  <span className="max-w-full truncate">{result.label}</span>
                  <span className="text-xs text-text-subtle">{result.section}</span>
                </div>
              ))}
            </div>
          ) : <p role="status" className="text-xs text-text-subtle">No settings found.</p>}
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
                'text-text-subtle data-[active]:bg-background-default data-[active]:text-text-default data-[active]:shadow-sm',
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
