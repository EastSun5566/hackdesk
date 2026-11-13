import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { QuickCaptureShortcutStatus } from '@/lib/electron-api';
import { displayShortcutConfig, isMacPlatform, recordShortcutFromEvent, shortcutConfigsOverlap } from '@/lib/keyboard-shortcuts';
import {
  DEFAULT_QUICK_CAPTURE_PIN_SHORTCUT,
  DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT,
  getQuickCapturePinShortcutProblem,
  getQuickCaptureToggleShortcutProblem,
  recordGlobalShortcutFromEvent,
  type QuickCaptureShortcutProblem,
} from '@/lib/quick-capture-shortcuts';
import { cn } from '@/lib/utils';

import { SettingsSection } from './SettingsPrimitives';

type QuickHackShortcut = 'toggle' | 'pin';

const ROW_LABELS: Record<QuickHackShortcut, string> = {
  toggle: 'Open or close Quick Hack',
  pin: 'Pin Quick Hack',
};

/**
 * The Quick Hack shortcuts: the global hotkey and the pin inside the popup. They record like the
 * app's shortcuts but save with the Quick Hack settings, and they only clash with each other and
 * the popup's editor keys, not with main-window shortcuts.
 */
export function QuickHackShortcutsSection({
  platform,
  filter,
  listClassName,
  rowClassName,
  toggleShortcut,
  savedToggleShortcut,
  pinShortcut,
  onToggleShortcutChange,
  onPinShortcutChange,
}: {
  platform: string;
  /** The panel's search, already trimmed and lowercased. */
  filter: string;
  listClassName: string;
  rowClassName: string;
  toggleShortcut: string;
  /** The hotkey main has applied; the registration status is checked again when it changes. */
  savedToggleShortcut: string | undefined;
  pinShortcut: string;
  onToggleShortcutChange: (shortcut: string) => void;
  onPinShortcutChange: (shortcut: string) => void;
}) {
  const [recording, setRecording] = useState<QuickHackShortcut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<QuickCaptureShortcutStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.hackdeskAPI?.app.getQuickCaptureShortcutStatus?.().then((next) => {
      if (!cancelled) setStatus(next);
    }).catch(() => {
      if (!cancelled) setStatus({ shortcut: savedToggleShortcut ?? DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT, registered: false });
    });

    return () => {
      cancelled = true;
    };
  }, [savedToggleShortcut]);

  const values: Record<QuickHackShortcut, string> = { toggle: toggleShortcut, pin: pinShortcut };
  const defaults: Record<QuickHackShortcut, string> = {
    toggle: DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT,
    pin: DEFAULT_QUICK_CAPTURE_PIN_SHORTCUT,
  };
  const change = (row: QuickHackShortcut, shortcut: string) => {
    setError(null);
    (row === 'toggle' ? onToggleShortcutChange : onPinShortcutChange)(shortcut);
  };
  // Recorded ⌃⌥H reads `ctrl+alt+h` on macOS and `mod+alt+h` elsewhere; both are the default.
  const isDefault = (row: QuickHackShortcut) => values[row] === defaults[row]
    || (values[row] !== 'none' && shortcutConfigsOverlap(values[row], defaults[row], platform));
  const display = (row: QuickHackShortcut) => displayShortcutConfig(values[row], platform) || 'Disabled';

  const statusLabel = toggleShortcut === 'none'
    ? 'Off'
    : !status || status.shortcut !== toggleShortcut
      ? 'Checking…'
      : status.registered ? 'Global' : 'Unavailable';
  const statusWarns = toggleShortcut !== 'none' && status?.shortcut === toggleShortcut && !status.registered;

  const problemMessage = (row: QuickHackShortcut, problem: QuickCaptureShortcutProblem, shortcut: string) => {
    const keys = displayShortcutConfig(shortcut, platform);
    switch (problem) {
    case 'reserved':
      return 'This shortcut is reserved by the editor or operating system.';
    case 'modifier':
      return `Use a shortcut with ${isMacPlatform(platform) ? '⌘, ⌃ or ⌥' : 'Ctrl or Alt'}, so it does not ${
        row === 'toggle' ? 'take keys you type in other apps' : 'type into the note'
      }.`;
    case 'key':
      return 'Use a letter, number, function key, Space or arrow key with it.';
    case 'quick-hack':
      return `The Quick Hack editor already uses ${keys}.`;
    case 'other':
      return `${keys} is already assigned to ${ROW_LABELS[row === 'toggle' ? 'pin' : 'toggle']}.`;
    }
  };

  const handleKeyDown = (row: QuickHackShortcut, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (recording !== row) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      setRecording(null);
      setError(null);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      change(row, 'none');
      setRecording(null);
      return;
    }

    // Both are matched by key, but a global hotkey belongs to the physical key (Option changes it).
    const next = row === 'toggle'
      ? recordGlobalShortcutFromEvent(event.nativeEvent, platform)
      : recordShortcutFromEvent(event.nativeEvent, platform);
    if (!next) return;

    const problem = row === 'toggle'
      ? getQuickCaptureToggleShortcutProblem(next, pinShortcut)
      : getQuickCapturePinShortcutProblem(next, toggleShortcut);
    if (problem) {
      setError(problemMessage(row, problem, next));
      return;
    }

    change(row, next);
    setRecording(null);
  };

  const rowMatches = (row: QuickHackShortcut) => !filter || [
    ROW_LABELS[row],
    row === 'toggle' ? 'global hotkey capture' : 'keep open capture',
    display(row),
  ].join(' ').toLowerCase().includes(filter);
  const rows = (['toggle', 'pin'] as const).filter(rowMatches);
  if (rows.length === 0) return null;

  return (
    <SettingsSection
      title="Quick Hack"
      onRevert={() => {
        setError(null);
        onToggleShortcutChange(DEFAULT_QUICK_CAPTURE_TOGGLE_SHORTCUT);
        onPinShortcutChange(DEFAULT_QUICK_CAPTURE_PIN_SHORTCUT);
      }}
      revertLabel="Reset Quick Hack shortcuts"
    >
      {error ? (
        <p role="alert" className="mx-4 mt-3 rounded-md border border-destructive-default/60 bg-destructive-default/10 px-3 py-2 text-sm text-destructive-default">
          {error}
        </p>
      ) : null}
      <ul data-settings-flush className={listClassName}>
        {rows.map((row) => (
          <li key={row} className={rowClassName}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text-default">{ROW_LABELS[row]}</p>
              {row === 'toggle' ? (
                <p className={cn('truncate text-xs', statusWarns ? 'text-warning-default' : 'text-text-subtle')}>
                  {statusLabel}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              data-shortcut-recording={recording === row || undefined}
              aria-label={`Set shortcut for ${ROW_LABELS[row]}`}
              onClick={() => {
                setError(null);
                setRecording(row);
              }}
              onBlur={() => setRecording((current) => (current === row ? null : current))}
              onKeyDown={(event) => handleKeyDown(row, event)}
              className={cn('min-w-28 px-3', recording === row && 'border-focus-ring bg-background-selected')}
            >
              {recording === row ? 'Press keys…' : display(row)}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Reset shortcut for ${ROW_LABELS[row]}`}
              disabled={isDefault(row)}
              onClick={() => change(row, defaults[row])}
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
