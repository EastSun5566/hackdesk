import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ElectronActionId } from '@/lib/electron-api';
import type { LeaderLevel } from '@/lib/leader-keys';
import { cn } from '@/lib/utils';

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock']);

/**
 * The leader menu: one letter opens a group, the next runs its command. It takes keys before the
 * rest of the window, so typing never reaches the note, and focus stays where it was for the command.
 */
export function LeaderMenu({
  level,
  onPathChange,
  onClose,
  onRun,
}: {
  level: LeaderLevel;
  onPathChange: (path: string[]) => void;
  onClose: () => void;
  onRun: (actionId: ElectronActionId) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ level, onPathChange, onClose, onRun });
  latest.current = { level, onPathChange, onClose, onRun };

  useEffect(() => {
    const choose = (key: string) => {
      const { level: current, onPathChange: setPath, onClose: close, onRun: run } = latest.current;
      const item = current.items.find(candidate => candidate.key === key);
      if (!item) { setNotice(`${key.toUpperCase()} is not a command here.`); return; }
      if (!item.actionId) { setNotice(null); setPath([...current.path, key]); return; }
      if (item.disabledReason) { setNotice(item.disabledReason); return; }
      close();
      // Run once the menu is gone, so the command sees the window as it was.
      const actionId = item.actionId;
      window.requestAnimationFrame(() => run(actionId));
    };
    const keydown = (event: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(event.key) || event.isComposing) return;
      // A shortcut with a modifier leaves the menu and does its usual job.
      if (event.metaKey || event.ctrlKey || event.altKey) { latest.current.onClose(); return; }
      event.preventDefault();
      event.stopPropagation();
      const { level: current, onPathChange: setPath, onClose: close } = latest.current;
      if (event.key === 'Escape') { close(); return; }
      if (event.key === 'Backspace') {
        setNotice(null);
        if (current.path.length) setPath(current.path.slice(0, -1));
        else close();
        return;
      }
      if (event.key.length === 1) choose(event.key.toLowerCase());
    };
    const pointerdown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) latest.current.onClose();
    };
    window.addEventListener('keydown', keydown, true);
    document.addEventListener('pointerdown', pointerdown, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      document.removeEventListener('pointerdown', pointerdown, true);
    };
  }, []);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={level.title.join(' › ')}
      data-leader-menu
      className="fixed bottom-8 right-3 z-50 w-75 rounded-lg border border-border-default bg-background-default p-2 text-sm text-text-default shadow-lg"
    >
      <p className="px-2 pb-1.5 pt-0.5 text-2xs font-medium uppercase tracking-wide text-text-subtle">{level.title.join(' › ')}</p>
      <ul className="max-h-96 overflow-y-auto">
        {level.items.map(item => (
          <li key={item.key} role="none">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabledReason ? true : undefined}
              title={item.disabledReason}
              onClick={() => {
                if (!item.actionId) { setNotice(null); onPathChange([...level.path, item.key]); return; }
                if (item.disabledReason) { setNotice(item.disabledReason); return; }
                onClose();
                const actionId = item.actionId;
                window.requestAnimationFrame(() => onRun(actionId));
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-element-bg-hover',
                item.disabledReason && 'text-text-subtle',
              )}
            >
              <span className="w-6 shrink-0 text-center font-mono font-semibold text-primary-default">{item.key.toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.actionId ? (
                item.shortcut ? <kbd className="font-mono text-2xs text-text-subtle">{item.shortcut}</kbd> : <span />
              ) : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-text-subtle" />}
            </button>
          </li>
        ))}
      </ul>
      {notice ? <p role="status" className="px-2 pt-1.5 text-xs text-text-subtle">{notice}</p> : null}
    </div>
  );
}
