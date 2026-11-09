import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';

import {
  ELECTRON_ACTIONS,
  getResolvedActionShortcut,
  resolveWorkbenchShortcut,
  type ElectronActionCategory,
} from '@/lib/electron-actions';
import { Button } from '@/components/ui/button';
import type { ElectronActionId } from '@/lib/electron-api';
import {
  displayShortcutConfig,
  getShortcutConflicts,
  isMacPlatform,
  isReservedShortcutConfig,
  isValidCustomShortcutConfig,
  recordShortcutFromEvent,
  type ShortcutOverrides,
} from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';

import { holdHintsPreference, leaderSpacePreference } from './keyboard-feature-preferences';
import { SettingsInput, SettingsPage, SettingsSection, SettingsSwitchRow } from './SettingsPrimitives';

const SHORTCUT_LIST_CLASS = 'm-0 flex list-none flex-col divide-y divide-border-subtle p-0';
const SHORTCUT_ROW_CLASS = 'flex min-w-0 items-center gap-3 py-2 pl-4 pr-2';

const EDITABLE_ACTIONS = ELECTRON_ACTIONS;
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
  characterShortcutsEnabled,
  onCharacterShortcutsChange,
  keyHintsVisible,
  onKeyHintsVisibleChange,
}: {
  characterShortcutsEnabled: boolean;
  onCharacterShortcutsChange: (enabled: boolean) => void;
  keyHintsVisible: boolean;
  onKeyHintsVisibleChange: (visible: boolean) => void;
  platform: string;
  shortcuts: ShortcutOverrides;
  onShortcutsChange: (shortcuts: ShortcutOverrides) => void;
}) {
  const leaderSpaceEnabled = leaderSpacePreference.use();
  const holdHintsEnabled = holdHintsPreference.use();
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
      resolveWorkbenchShortcut(action.id, shortcuts),
    ]),
  ) as Partial<Record<ElectronActionId, string>>, [shortcuts]);

  const normalizedFilter = filter.trim().toLowerCase();
  const showQuickCaptureShortcut = !normalizedFilter || [
    'quick hack',
    'global',
    'capture',
    quickCaptureShortcut,
  ].join(' ').toLowerCase().includes(normalizedFilter);
  const filteredActions = useMemo(() => (
    EDITABLE_ACTIONS.filter((action) => {
      if (!normalizedFilter) {
        return true;
      }

      const displayShortcut = getResolvedActionShortcut(action.id, shortcuts, platform, characterShortcutsEnabled) ?? '';
      return [
        action.label,
        action.description,
        action.category,
        action.keywords.join(' '),
        displayShortcut,
      ].join(' ').toLowerCase().includes(normalizedFilter);
    })
  ), [normalizedFilter, platform, shortcuts, characterShortcutsEnabled]);

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
    <SettingsPage>
      <SettingsSection title="Keyboard">
        <SettingsSwitchRow
          id="settings-character-shortcuts"
          label="Enable ?, / and Space outside text editing"
          checked={characterShortcutsEnabled}
          onCheckedChange={onCharacterShortcutsChange}
        />
        <SettingsSwitchRow
          id="settings-key-hints"
          label="Show key hints"
          checked={keyHintsVisible}
          onCheckedChange={onKeyHintsVisibleChange}
        />
        {/* Kept on this computer and applied at once, unlike the options above, which save with the dialog. */}
        <SettingsSwitchRow
          id="settings-leader-space"
          label="Space opens the leader menu"
          checked={leaderSpaceEnabled}
          onCheckedChange={leaderSpacePreference.set}
        />
        <SettingsSwitchRow
          id="settings-hold-hints"
          label={`Hold ${isMacPlatform(platform) ? '⌘' : 'Ctrl'} to show navigation hints`}
          checked={holdHintsEnabled}
          onCheckedChange={holdHintsPreference.set}
        />
      </SettingsSection>

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-icon-default" />
        <SettingsInput
          aria-label="Search shortcuts"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search shortcuts"
          className="pl-8"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive-default/60 bg-destructive-default/10 px-3 py-2 text-sm text-destructive-default">
          {error}
        </p>
      ) : null}

      {showQuickCaptureShortcut ? (
        <SettingsSection title="Global">
          <ul data-settings-flush className={SHORTCUT_LIST_CLASS}>
            <li className={SHORTCUT_ROW_CLASS}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-default">Quick Hack</p>
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
        </SettingsSection>
      ) : null}

      {GROUPS.map((group) => {
        const actions = filteredActions.filter((action) => action.category === group);
        if (actions.length === 0) {
          return null;
        }

        return (
          <SettingsSection key={group} title={GROUP_LABELS[group]}>
            <ul data-settings-flush className={SHORTCUT_LIST_CLASS}>
              {actions.map((action) => {
                const isActive = activeActionId === action.id;
                const displayShortcut = getResolvedActionShortcut(action.id, shortcuts, platform, characterShortcutsEnabled) || (resolveWorkbenchShortcut(action.id, shortcuts, characterShortcutsEnabled) === 'none' ? 'Disabled' : 'Unassigned');
                const hasOverride = Object.prototype.hasOwnProperty.call(shortcuts, action.id);

                return (
                  <li key={action.id} className={SHORTCUT_ROW_CLASS}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-default">{action.label}</p>
                    </div>
                    <Button
                      ref={isActive ? activeButtonRef : undefined}
                      size="sm"
                      data-shortcut-action={action.id}
                      data-shortcut-recording={isActive || undefined}
                      aria-label={`Set shortcut for ${action.label}`}
                      onClick={() => {
                        setError(null);
                        setActiveActionId(action.id);
                      }}
                      onKeyDown={(event) => handleCaptureKeyDown(action.id, event)}
                      className={cn('min-w-28 px-3', isActive && 'border-focus-ring bg-background-selected')}
                    >
                      {isActive ? 'Press keys…' : displayShortcut}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Reset shortcut for ${action.label}`}
                      disabled={!hasOverride}
                      onClick={() => resetShortcut(action.id)}
                    >
                      <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </SettingsSection>
        );
      })}
    </SettingsPage>
  );
}
