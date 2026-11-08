import { type CSSProperties, useEffect, useState } from 'react';

import { getResolvedActionShortcut, type ElectronActionContext } from '@/lib/electron-actions';
import { useEditorStatus, type EditorStatusSnapshot } from '@/lib/editor-status-store';
import { getKeyHints, type KeyHint, type KeyHintContext } from '@/lib/key-hints';
import type { LeaderLevel } from '@/lib/leader-keys';
import type { ShortcutOverrides } from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS, HACK_MODE_HIDDEN_CLASS } from './ui';

/** How long after the last keystroke the bar comes back. */
const TYPING_PAUSE_MS = 1500;
const MODIFIERS = new Set(['Meta', 'Control', 'Alt']);

/** Where focus is now, read from the page so it never trails behind. */
export function currentContext(fallback: KeyHintContext): KeyHintContext {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return fallback;
  if (element.matches('input[name="noteSearch"]')) return 'finder';
  const zone = element.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus;
  return zone === 'navigator' || zone === 'tabs' || zone === 'editor' || zone === 'inspector' ? zone : fallback;
}

function isLeftContext(context: KeyHintContext) {
  return context === 'navigator' || context === 'finder';
}

function hintOptions(
  actionContext: ElectronActionContext,
  shortcuts: ShortcutOverrides | undefined,
  platform: string,
  characterShortcutsEnabled: boolean,
) {
  return { actionContext, shortcuts, platform, characterShortcutsEnabled };
}

function EditorStatusText({ status }: { status: EditorStatusSnapshot }) {
  if (!status.active) return null;
  const segments: string[] = [];
  if (status.vimMode) segments.push(status.vimMode);
  else if (status.kakouneMode) segments.push(status.kakouneMode);
  segments.push(`Ln ${status.line}, Col ${status.column}`);
  segments.push(status.wordCount === 1 ? '1 word' : `${status.wordCount} words`);
  return (
    <span className="shrink-0 tabular-nums" data-testid="editor-status-text">
      {segments.join(' · ')}
    </span>
  );
}

function HintList({ hints }: { hints: KeyHint[] }) {
  if (!hints.length) return null;
  return (
    // Hints that don't fit wrap onto a second row that the fixed height clips, so a hint drops out
    // whole instead of being cut mid-word at the split.
    <ul className="flex h-5 min-w-0 flex-wrap items-center gap-x-4 overflow-hidden whitespace-nowrap">
      {hints.map(hint => (
        <li key={`${hint.keys}:${hint.label}`} className="flex shrink-0 items-center gap-1.5">
          <kbd className="rounded-sm border border-border-default bg-background-default px-1 font-mono leading-4 text-text-default">{hint.keys}</kbd>
          <span>{hint.label}</span>
        </li>
      ))}
    </ul>
  );
}

function ShortcutsButton({
  helpKeys,
  onOpenShortcuts,
  className,
}: {
  helpKeys: string | undefined;
  onOpenShortcuts: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpenShortcuts}
      className={cn('-mr-1 flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-1 hover:text-text-default', FOCUS_RING_CLASS, className)}
    >
      {helpKeys ? <kbd className="rounded-sm border border-border-default bg-background-default px-1 font-mono leading-4 text-text-default">{helpKeys}</kbd> : null}
      <span>Shortcuts</span>
    </button>
  );
}

const HALF_DIM_CLASS = 'opacity-50 transition-opacity duration-200 motion-reduce:transition-none';

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
  splitStatusLine = false,
  sidebarWidth = 0,
  navigatorCollapsed = false,
  keyHintsVisible = true,
}: {
  actionContext: ElectronActionContext;
  /** While the leader menu is open, the bar shows its keys. */
  leader?: LeaderLevel | null;
  shortcuts: ShortcutOverrides | undefined;
  platform: string;
  characterShortcutsEnabled: boolean;
  onOpenShortcuts: () => void;
  splitStatusLine?: boolean;
  sidebarWidth?: number;
  navigatorCollapsed?: boolean;
  keyHintsVisible?: boolean;
}) {
  const editorStatus = useEditorStatus();
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

  const options = hintOptions(actionContext, shortcuts, platform, characterShortcutsEnabled);
  const helpKeys = getResolvedActionShortcut('show-keyboard-shortcuts', shortcuts, platform, characterShortcutsEnabled);
  const hints: KeyHint[] = leader
    ? [
      ...leader.items.slice(0, 6).map(item => ({ keys: item.key.toUpperCase(), label: item.label })),
      ...(leader.path.length ? [{ keys: '⌫', label: 'Back' }] : []),
      { keys: 'Esc', label: 'Close' },
    ]
    : getKeyHints(context, options);

  const showSplit = splitStatusLine && !leader;
  const leftHints = keyHintsVisible ? getKeyHints('navigator', options) : [];
  const rightHints = keyHintsVisible ? getKeyHints('editor', options) : [];
  const leftActive = isLeftContext(context);
  const splitStyle = showSplit && !navigatorCollapsed && sidebarWidth > 0
    // Less the bar's own 16px left padding, so the split lands on the sidebar's edge.
    ? ({ '--status-split': `${Math.max(0, Math.round(sidebarWidth) - 16)}px` } as CSSProperties)
    : undefined;

  return (
    <footer
      role="note"
      aria-label="Keys you can press"
      data-key-hint-context={leader ? 'leader' : context}
      data-split-status-line={showSplit ? 'true' : undefined}
      data-status-emphasis={showSplit ? (leftActive ? 'left' : 'right') : undefined}
      data-typing={typing && !leader ? 'true' : undefined}
      style={splitStyle}
      className={cn(
        // The bar sits under the card's 6px gap, so 6px of bottom padding puts the keys midway
        // between the card and the window edge.
        'flex h-8 shrink-0 items-center gap-4 overflow-hidden px-4 pb-1.5 text-2xs text-text-subtle transition-opacity duration-300 motion-reduce:transition-none',
        HACK_MODE_HIDDEN_CLASS,
        typing && !leader && 'opacity-0',
      )}
    >
      {showSplit ? (
        <div className="flex min-w-0 flex-1 items-center overflow-hidden">
          {!navigatorCollapsed && sidebarWidth > 0 ? (
            <div
              data-testid="key-hint-half-left"
              className={cn(
                'flex min-w-0 w-(--status-split) shrink-0 items-center overflow-hidden',
                !leftActive && HALF_DIM_CLASS,
              )}
            >
              <HintList hints={leftHints} />
            </div>
          ) : null}
          <div
            data-testid="key-hint-half-right"
            className={cn(
              // Starts 16px past the sidebar's edge, as the left half starts 16px past the window's.
              'flex min-w-0 flex-1 items-center gap-4 overflow-hidden',
              !navigatorCollapsed && sidebarWidth > 0 && 'pl-4',
              leftActive && HALF_DIM_CLASS,
            )}
          >
            <EditorStatusText status={editorStatus} />
            <HintList hints={rightHints} />
            <ShortcutsButton helpKeys={helpKeys} onOpenShortcuts={onOpenShortcuts} className="ml-auto" />
          </div>
        </div>
      ) : (
        <>
          <ul className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden whitespace-nowrap">
            {hints.map(hint => (
              <li key={`${hint.keys}:${hint.label}`} className="flex shrink-0 items-center gap-1.5">
                <kbd className="rounded-sm border border-border-default bg-background-default px-1 font-mono leading-4 text-text-default">{hint.keys}</kbd>
                <span>{hint.label}</span>
              </li>
            ))}
          </ul>
          <ShortcutsButton helpKeys={helpKeys} onOpenShortcuts={onOpenShortcuts} />
        </>
      )}
    </footer>
  );
}
