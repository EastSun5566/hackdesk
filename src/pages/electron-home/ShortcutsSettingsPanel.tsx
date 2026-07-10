import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';

import {
  DEFAULT_ACTION_KEYBINDINGS,
  ELECTRON_ACTIONS,
  getResolvedActionShortcut,
  type ElectronActionCategory,
} from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';
import {
  displayShortcutConfig,
  getShortcutConflicts,
  isReservedShortcutConfig,
  isValidCustomShortcutConfig,
  recordShortcutFromEvent,
  resolveActionShortcut,
  type ShortcutOverrides,
} from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';

import { SettingsInput, SettingsSection } from './SettingsPrimitives';
import { FOCUS_RING_CLASS } from './ui';

const EDITABLE_ACTIONS = ELECTRON_ACTIONS.filter((action) => action.id !== 'search-notes');
const GROUPS: ElectronActionCategory[] = ['create', 'navigation', 'view', 'note', 'folder', 'app'];
const GROUP_LABELS: Record<ElectronActionCategory, string> = {
  app: 'App',
  create: 'Create',
  folder: 'Folder',
  navigation: 'Navigation',
  note: 'Note',
  view: 'View',
};

export type ShortcutsDraftStatus = {
  error: string | null;
  hasDraftChanges: boolean;
};

export function getShortcutsDraftStatus(
  saved: ShortcutOverrides | undefined,
  draft: ShortcutOverrides,
): ShortcutsDraftStatus {
  const error = Object.entries(draft).find(([, value]) => typeof value === 'string' && !isValidCustomShortcutConfig(value));

  return {
    error: error ? 'Fix invalid shortcuts before saving.' : null,
    hasDraftChanges: JSON.stringify(saved ?? {}) !== JSON.stringify(draft),
  };
}

export function ShortcutsSettingsPanel({
  platform,
  shortcuts,
  onShortcutsChange,
}: {
  platform: string;
  shortcuts: ShortcutOverrides;
  onShortcutsChange: (shortcuts: ShortcutOverrides) => void;
}) {
  const [filter, setFilter] = useState('');
  const [activeActionId, setActiveActionId] = useState<ElectronActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickCaptureRegistered, setQuickCaptureRegistered] = useState<boolean | null>(null);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const quickCaptureShortcut = displayShortcutConfig('control+alt+h', platform);
  const quickCaptureStatusLabel = quickCaptureRegistered == null
    ? 'Checking…'
    : quickCaptureRegistered ? 'Global' : 'Unavailable';

  useEffect(() => {
    let cancelled = false;
    void window.hackdeskAPI?.app.getQuickCaptureShortcutStatus?.().then((status) => {
      if (!cancelled) {
        setQuickCaptureRegistered(status.registered);
      }
    }).catch(() => {
      if (!cancelled) {
        setQuickCaptureRegistered(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const labels = useMemo(() => Object.fromEntries(
    EDITABLE_ACTIONS.map((action) => [action.id, action.label]),
  ) as Partial<Record<ElectronActionId, string>>, []);

  const resolvedShortcuts = useMemo(() => Object.fromEntries(
    EDITABLE_ACTIONS.map((action) => [
      action.id,
      resolveActionShortcut(action.id, DEFAULT_ACTION_KEYBINDINGS, shortcuts),
    ]),
  ) as Partial<Record<ElectronActionId, string>>, [shortcuts]);

  const normalizedFilter = filter.trim().toLowerCase();
  const showQuickCaptureShortcut = !normalizedFilter || [
    'quick capture',
    'global',
    'capture',
    quickCaptureShortcut,
  ].join(' ').toLowerCase().includes(normalizedFilter);
  const filteredActions = useMemo(() => (
    EDITABLE_ACTIONS.filter((action) => {
      if (!normalizedFilter) {
        return true;
      }

      const displayShortcut = getResolvedActionShortcut(action.id, shortcuts, platform) ?? '';
      return [
        action.label,
        action.description,
        action.category,
        action.keywords.join(' '),
        displayShortcut,
      ].join(' ').toLowerCase().includes(normalizedFilter);
    })
  ), [normalizedFilter, platform, shortcuts]);

  const updateShortcut = (actionId: ElectronActionId, value: string | undefined) => {
    setError(null);
    onShortcutsChange({
      ...shortcuts,
      [actionId]: value,
    });
  };

  const resetShortcut = (actionId: ElectronActionId) => {
    setError(null);
    const next = { ...shortcuts };
    delete next[actionId];
    onShortcutsChange(next);
  };

  const handleCaptureKeyDown = (actionId: ElectronActionId, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (activeActionId !== actionId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      setActiveActionId(null);
      setError(null);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      updateShortcut(actionId, 'none');
      setActiveActionId(null);
      return;
    }

    const nextShortcut = recordShortcutFromEvent(event.nativeEvent, platform);
    if (!nextShortcut) {
      return;
    }

    if (!isValidCustomShortcutConfig(nextShortcut)) {
      setError(isReservedShortcutConfig(nextShortcut)
        ? 'This shortcut is reserved by the editor or operating system.'
        : 'Use a shortcut with a modifier key.');
      return;
    }

    const conflicts = getShortcutConflicts(actionId, nextShortcut, resolvedShortcuts, labels, platform);
    if (conflicts.length > 0) {
      setError(`${displayShortcutConfig(nextShortcut, platform)} is already assigned to ${conflicts.join(', ')}.`);
      return;
    }

    updateShortcut(actionId, nextShortcut);
    setActiveActionId(null);
  };

  return (
    <SettingsSection title="Shortcuts">
      <div className="space-y-4">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
          <SettingsInput
            aria-label="Search shortcuts"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search shortcuts"
            className="h-10 w-full rounded-md border border-border-default bg-background-muted py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-focus-ring"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive-default/60 bg-destructive-default/10 px-3 py-2 text-sm text-destructive-default">
            {error}
          </p>
        ) : null}

        <div className="space-y-5">
          {showQuickCaptureShortcut ? (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Global</h4>
              <ul className="divide-y divide-border-default rounded-lg border border-border-default bg-background-muted/40">
                <li className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-default">Quick Capture</p>
                    <p className="truncate text-xs text-text-subtle">
                      Open a quick capture window from anywhere.
                    </p>
                  </div>
                  <span className="inline-flex h-8 min-w-28 items-center justify-center rounded-md border border-border-default bg-background-default px-3 text-xs font-medium text-text-default">
                    {quickCaptureShortcut}
                  </span>
                  <span className={cn(
                    'w-28 text-right text-xs',
                    quickCaptureRegistered === false ? 'text-warning-default' : 'text-text-subtle',
                  )}
                  >
                    {quickCaptureStatusLabel}
                  </span>
                </li>
              </ul>
            </section>
          ) : null}

          {GROUPS.map((group) => {
            const actions = filteredActions.filter((action) => action.category === group);
            if (actions.length === 0) {
              return null;
            }

            return (
              <section key={group} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">{GROUP_LABELS[group]}</h4>
                <ul className="divide-y divide-border-default rounded-lg border border-border-default bg-background-muted/40">
                  {actions.map((action) => {
                    const isActive = activeActionId === action.id;
                    const displayShortcut = getResolvedActionShortcut(action.id, shortcuts, platform) || 'Unassigned';
                    const hasOverride = Object.prototype.hasOwnProperty.call(shortcuts, action.id);

                    return (
                      <li key={action.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-default">{action.label}</p>
                          <p className="truncate text-xs text-text-subtle">{action.description}</p>
                        </div>
                        <button
                          ref={isActive ? activeButtonRef : undefined}
                          type="button"
                          data-shortcut-action={action.id}
                          aria-label={`Set shortcut for ${action.label}`}
                          onClick={() => {
                            setError(null);
                            setActiveActionId(action.id);
                          }}
                          onKeyDown={(event) => handleCaptureKeyDown(action.id, event)}
                          className={cn(
                            'inline-flex h-8 min-w-28 items-center justify-center rounded-md border border-border-default bg-background-default px-3 text-xs font-medium text-text-default transition-colors hover:bg-element-bg-hover',
                            isActive && 'border-focus-ring bg-background-selected text-text-default',
                            FOCUS_RING_CLASS,
                          )}
                        >
                          {isActive ? 'Press keys…' : displayShortcut}
                        </button>
                        <button
                          type="button"
                          aria-label={`Reset shortcut for ${action.label}`}
                          disabled={!hasOverride}
                          onClick={() => resetShortcut(action.id)}
                          className={cn(
                            'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default disabled:pointer-events-none disabled:opacity-40',
                            FOCUS_RING_CLASS,
                          )}
                        >
                          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </SettingsSection>
  );
}
