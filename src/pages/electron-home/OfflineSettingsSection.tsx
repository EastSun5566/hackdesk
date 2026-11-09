import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getAiErrorMessage } from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';
import type { NoteIndexStatus } from '@/lib/note-index';
import { defaultOfflineSettings, type OfflineSettings } from '@/lib/settings';

import { SettingsSection, SettingsSwitchRow } from './SettingsPrimitives';

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Whether opened HackMD notes stay on this computer for offline reading and text search. */
export function OfflineSettingsSection({ active }: { active: boolean }) {
  const api = getHackDeskAPI();
  const [settings, setSettings] = useState<OfflineSettings | null>(null);
  const [status, setStatus] = useState<NoteIndexStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    void api?.noteIndex?.status().then(setStatus).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (!active || !api?.noteIndex) return;
    void api.settings.get().then(saved => setSettings(saved.offline ?? defaultOfflineSettings)).catch(() => undefined);
    loadStatus();
  }, [active, api, loadStatus]);

  if (!api?.noteIndex) return null;

  const run = async (work: () => Promise<unknown>) => {
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
  };

  const cached = status?.hackmdNotes ?? 0;

  return (
    <SettingsSection
      title="Offline and search"
      description="Only opened HackMD notes are cached."
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
      <div className="flex items-center justify-between gap-4 text-sm">
        <div className="min-w-0">
          <p className="font-medium leading-5">Cached notes</p>
          <p className="text-xs leading-5 text-text-subtle" role="status">
            {status ? `${cached} HackMD ${cached === 1 ? 'note' : 'notes'} kept${cached ? ` · ${formatBytes(status.hackmdBytes)}` : ''}` : 'Checking…'}
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={busy || !cached} onClick={() => void run(() => api.noteIndex!.clear())}>
          Clear Cached Notes
        </Button>
      </div>
    </SettingsSection>
  );
}
