import { useEffect, useState } from 'react';

import type { ElectronActionContext } from '@/lib/electron-actions';
import { getKeyHints, type KeyHint, type KeyHintContext } from '@/lib/key-hints';
import type { LeaderLevel } from '@/lib/leader-keys';
import type { ShortcutOverrides } from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS, WRITING_FADE_CLASS } from './ui';

/** Where focus is now, read from the page so it never trails behind. */
function currentContext(fallback: KeyHintContext): KeyHintContext {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return fallback;
  if (element.matches('input[name="noteSearch"]')) return 'finder';
  const zone = element.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus;
  return zone === 'navigator' || zone === 'tabs' || zone === 'editor' || zone === 'inspector' ? zone : fallback;
}

/**
 * A quiet line of the keys that matter where focus is, like a game's button prompts. It fades with
 * the rest of the workbench while you type in a note.
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

  useEffect(() => {
    const focus = () => setContext(current => currentContext(current));
    focus();
    document.addEventListener('focusin', focus);
    return () => document.removeEventListener('focusin', focus);
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
      className={cn(
        'flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t border-border-default bg-background-muted px-3 text-2xs text-text-subtle',
        WRITING_FADE_CLASS,
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
