import { useEffect, useState, type CSSProperties } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildFontStack, listLocalFontFamilies, primaryFontFamily } from '@/lib/local-fonts';
import { isSafeFontStack } from '@/lib/themes';
import { cn } from '@/lib/utils';

// Each name previews itself through --font-preview (see .font-preview in styles.css).

/**
 * A font field that picks from the fonts installed on this Mac, each previewed in its own face,
 * with a filter that also accepts a typed font stack. The stored value stays a CSS font stack.
 */
export function FontStackPicker({
  id,
  value,
  defaultStack,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  value: string;
  defaultStack: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Null until first opened: reading installed fonts is only worth it once someone looks.
  const [families, setFamilies] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open || families !== null) return;
    let cancelled = false;
    void listLocalFontFamilies().then((list) => {
      if (!cancelled) setFamilies(list);
    });
    return () => {
      cancelled = true;
    };
  }, [families, open]);

  const stack = value.trim() || defaultStack;
  const isDefault = stack === defaultStack;
  const current = primaryFontFamily(stack);
  const typed = query.trim();
  // Offer the typed text as a stack only once it is clearly one (it lists fallbacks) or names no
  // installed font, so a partial name filters the list instead of proposing itself.
  const offerTyped = Boolean(typed)
    && isSafeFontStack(typed)
    && (typed.includes(',') || !families?.some((family) => family.toLowerCase().includes(typed.toLowerCase())));

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        title={stack}
        className={cn(
          'flex h-8.5 w-full min-w-0 items-center gap-2 rounded border bg-transparent px-3 text-left text-sm text-text-default transition-colors',
          'focus-visible:border-border-primary-subtler focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-primary-subtler',
          invalid ? 'border-destructive-default' : 'border-border-default',
        )}
      >
        <span className="font-preview min-w-0 flex-1 truncate" style={{ '--font-preview': stack } as CSSProperties}>{current}</span>
        {isDefault ? <span className="shrink-0 text-xs text-text-subtle">Default</span> : null}
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-icon-default" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-64 overflow-hidden p-0">
        {/* Plain substring match: fuzzy matching lets "av" find "Savoye" and "iA Writer". */}
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Filter fonts or type a font stack"
            aria-label="Filter fonts"
          />
          <CommandList className="py-1.5">
            <CommandEmpty>{families === null ? 'Loading installed fonts…' : 'No matching fonts.'}</CommandEmpty>
            {offerTyped ? (
              <CommandGroup>
                <CommandItem value={`use ${typed}`} forceMount onSelect={() => choose(typed)}>
                  <span className="min-w-0 truncate">Use “{typed}”</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup>
              <CommandItem value={`default ${defaultStack}`} onSelect={() => choose(defaultStack)}>
                <span className="font-preview min-w-0 flex-1 truncate" style={{ '--font-preview': defaultStack } as CSSProperties}>
                  {primaryFontFamily(defaultStack)} <span className="text-command-item-meta">· Default</span>
                </span>
                {isDefault ? <Check aria-hidden="true" /> : null}
              </CommandItem>
            </CommandGroup>
            {families?.length ? (
              <CommandGroup heading="Installed fonts">
                {families.map((family) => (
                  <CommandItem key={family} value={family} onSelect={() => choose(buildFontStack(family))}>
                    <span className="font-preview min-w-0 flex-1 truncate" style={{ '--font-preview': `"${family}"` } as CSSProperties}>{family}</span>
                    {!isDefault && family === current ? <Check aria-hidden="true" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : families ? (
              <p className="px-5 py-2 text-xs text-text-subtle">
                Installed fonts aren’t available here. Type a font stack, like Inter, system-ui, sans-serif.
              </p>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
