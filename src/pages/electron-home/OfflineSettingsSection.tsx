import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getAiErrorMessage } from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';
import type { NoteIndexStatus } from '@/lib/note-index';
import { defaultOfflineSettings, type OfflineSettings } from '@/lib/settings';

import { SettingsActionRow, SettingsSection, SettingsSwitchRow } from './SettingsPrimitives';

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Whether opened HackMD notes stay on this computer for offline reading and text search. */
export function OfflineSettingsSection({ active, resetSignal = 0 }: { active: boolean; resetSignal?: number }) {
  const api = getHackDeskAPI();
  const [settings, setSettings] = useState<OfflineSettings | null>(null);
  const [status, setStatus] = useState<NoteIndexStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastResetSignal = useRef(0);

  const loadStatus = useCallback(() => {
    void api?.noteIndex?.status().then(setStatus).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (!active || !api?.noteIndex) return;
    void api.settings.get().then(saved => setSettings(saved.offline ?? defaultOfflineSettings)).catch(() => undefined);
    loadStatus();
  }, [active, api, loadStatus]);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      loadStatus();
    } catch (runError) {
      setError(getAiErrorMessage(runError));
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  const revertSection = useCallback(() => {
    if (!api) return;
    void run(async () => {
      const saved = await api.settings.update({ offline: { ...defaultOfflineSettings } });
      setSettings(saved.offline ?? { ...defaultOfflineSettings });
    });
  }, [api, run]);

  // The header Reset button reaches this self-saving section through the page.
  useEffect(() => {
    if (!resetSignal || resetSignal === lastResetSignal.current) return;
    lastResetSignal.current = resetSignal;
    revertSection();
  }, [resetSignal, revertSection]);

  if (!api?.noteIndex) return null;

  const cached = status?.hackmdNotes ?? 0;

  return (
    <SettingsSection
      title="Offline and search"
      description="Only opened HackMD notes are cached."
      onRevert={revertSection}
      revertLabel="Keep opened HackMD notes offline"
    >
      {error ? <p role="alert" className="text-sm text-destructive-default">{error}</p> : null}
      <SettingsSwitchRow
        id="settings-offline-keep-hackmd"
        label="Keep opened HackMD notes offline"
        checked={settings?.keepHackmdNotes ?? defaultOfflineSettings.keepHackmdNotes}
        disabled={busy || !settings}
        onCheckedChange={checked => void run(async () => {
          const saved = await api.settings.update({ offline: { keepHackmdNotes: checked } });
          setSettings(saved.offline ?? { keepHackmdNotes: checked });
        })}
      />
      <SettingsActionRow
        label="Cached notes"
        descriptionRole="status"
        description={status ? `${cached} HackMD ${cached === 1 ? 'note' : 'notes'} kept${cached ? ` · ${formatBytes(status.hackmdBytes)}` : ''}` : 'Checking…'}
        action={(
          <Button variant="secondary" size="sm" disabled={busy || !cached} onClick={() => void run(() => api.noteIndex!.clear())}>
            Clear Cached Notes
          </Button>
        )}
      />
    </SettingsSection>
  );
}
