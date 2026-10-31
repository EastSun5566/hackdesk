import { useEffect, useState } from 'react';

import type { ElectronActionContext } from '@/lib/electron-actions';
import { getKeyHints, type KeyHint, type KeyHintContext } from '@/lib/key-hints';
import type { LeaderLevel } from '@/lib/leader-keys';
import type { ShortcutOverrides } from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS } from './ui';

/** How long after the last keystroke the bar comes back. */
const TYPING_PAUSE_MS = 1500;
const MODIFIERS = new Set(['Meta', 'Control', 'Alt']);

/** Where focus is now, read from the page so it never trails behind. */
function currentContext(fallback: KeyHintContext): KeyHintContext {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return fallback;
  if (element.matches('input[name="noteSearch"]')) return 'finder';
  const zone = element.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus;
  return zone === 'workspace' || zone === 'navigator' || zone === 'tabs' || zone === 'editor' || zone === 'inspector' ? zone : fallback;
}

/**
 * A quiet line of the keys that matter where focus is, like a game's button prompts. It fades while
 * you type in a note and returns when you pause, move the pointer, or reach for a modifier.
 */
export function KeyHintBar({
  actionContext,
  shortcuts,
  platform,
  characterShortcutsEnabled,
  leader,
  onOpenShortcuts,
}: {
  actionContext: ElectronActionContext;
  /** While the leader menu is open, the bar shows its keys. */
  leader?: LeaderLevel | null;
  shortcuts: ShortcutOverrides | undefined;
  platform: string;
  characterShortcutsEnabled: boolean;
  onOpenShortcuts: () => void;
}) {
  const [context, setContext] = useState<KeyHintContext>('navigator');
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const settle = () => { window.clearTimeout(timer); setTyping(false); };
    const focus = () => setContext(current => currentContext(current));
    const keydown = (event: KeyboardEvent) => {
      if (MODIFIERS.has(event.key) || event.metaKey || event.ctrlKey || event.altKey) { settle(); return; }
      if (!(event.target instanceof HTMLElement) || !event.target.closest('.cm-editor')) return;
      setTyping(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTyping(false), TYPING_PAUSE_MS);
    };
    focus();
    document.addEventListener('focusin', focus);
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('pointermove', settle);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('pointermove', settle);
    };
  }, []);

  const hints: KeyHint[] = leader
    ? [
      ...leader.items.slice(0, 6).map(item => ({ keys: item.key.toUpperCase(), label: item.label })),
      ...(leader.path.length ? [{ keys: '⌫', label: 'Back' }] : []),
      { keys: 'Esc', label: 'Close' },
    ]
    : getKeyHints(context, { actionContext, shortcuts, platform, characterShortcutsEnabled });

  return (
    <footer
      role="note"
      aria-label="Keys you can press"
      data-key-hint-context={leader ? 'leader' : context}
      data-typing={typing && !leader ? 'true' : undefined}
      className={cn(
        'flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t border-border-default bg-background-muted px-3 text-2xs text-text-subtle transition-opacity duration-300 motion-reduce:transition-none',
        typing && !leader && 'opacity-0',
      )}
    >
      <ul className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden whitespace-nowrap">
        {hints.map(hint => (
          <li key={`${hint.keys}:${hint.label}`} className="flex shrink-0 items-center gap-1.5">
            <kbd className="rounded-sm border border-border-default bg-background-default px-1 font-mono leading-4 text-text-default">{hint.keys}</kbd>
            <span>{hint.label}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpenShortcuts}
        className={cn('flex shrink-0 items-center gap-1.5 rounded-sm px-1 hover:text-text-default', FOCUS_RING_CLASS)}
      >
        <kbd className="rounded-sm border border-border-default bg-background-default px-1 font-mono leading-4 text-text-default">?</kbd>
        <span>Shortcuts</span>
      </button>
    </footer>
  );
}
