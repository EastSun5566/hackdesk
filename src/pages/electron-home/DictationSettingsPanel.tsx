import { useCallback, useEffect, useRef, useState } from 'react';
import { Meter } from '@base-ui/react/meter';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectLabelValue, SelectTrigger } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getAiErrorMessage } from '@/lib/ai';
import { notifyDictationSettingsChanged, type DictationStatus } from '@/lib/dictation';
import { getHackDeskAPI } from '@/lib/electron-api';
import { defaultDictationSettings, type DictationSettings } from '@/lib/settings';

import { SettingsSection } from './SettingsPrimitives';

const SYSTEM_LOCALE_VALUE = '__system__';

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

export function describeDictationLocale(locale: string) {
  try {
    return languageNames.of(locale) ?? locale;
  } catch {
    return locale;
  }
}

type PendingDownload = { locale: string; requestId: string; fraction: number };

export function DictationSettingsPanel({ active }: { active: boolean }) {
  const api = getHackDeskAPI();
  const [settings, setSettings] = useState<DictationSettings | null>(null);
  const [status, setStatus] = useState<DictationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<PendingDownload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const downloadRef = useRef<PendingDownload | null>(null);

  const loadStatus = useCallback(async () => {
    if (!api?.dictation) return;
    try {
      setStatus(await api.dictation.status());
    } catch (statusError) {
      setStatus({ available: false, message: getAiErrorMessage(statusError), locales: [], installed: [], suggested: null });
    }
  }, [api]);

  // Checked each time the tab opens: a language may have been downloaded by another app meanwhile.
  useEffect(() => {
    if (!active || !api?.dictation) return;
    void api.settings.get().then(saved => setSettings(saved.dictation ?? defaultDictationSettings)).catch(() => undefined);
    void loadStatus();
  }, [active, api, loadStatus]);

  // A download left running when Settings closes is cancelled; macOS keeps what it finished.
  useEffect(() => () => {
    const pending = downloadRef.current;
    if (pending) void api?.dictation?.cancel(pending.requestId).catch(() => undefined);
  }, [api]);

  const save = async (next: DictationSettings) => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.settings.update({ dictation: next });
      setSettings(saved.dictation ?? next);
      notifyDictationSettingsChanged();
    } catch (saveError) {
      setError(getAiErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const handleEnabledChange = async (enabled: boolean) => {
    if (!settings || !api) return;
    if (enabled) {
      const { confirmed } = await api.app.confirm({
        title: 'Turn on dictation?',
        message: 'HackDesk will ask macOS for microphone access the first time you dictate.',
        detail: 'HackDesk listens only while you dictate. Speech is turned into text on this Mac; the audio is never saved or sent anywhere.',
        confirmLabel: 'Turn On',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;
    }
    void save({ ...settings, enabled });
  };

  const startDownload = async (locale: string) => {
    if (!api?.dictation) return;
    const next = { locale, requestId: crypto.randomUUID(), fraction: 0 };
    downloadRef.current = next;
    setDownload(next);
    setError(null);
    try {
      await api.dictation.install({ requestId: next.requestId, locale }, (event) => {
        if (event.type === 'progress' && downloadRef.current?.requestId === next.requestId) {
          setDownload(current => (current?.requestId === next.requestId ? { ...current, fraction: event.fraction } : current));
        }
      });
      await loadStatus();
    } catch (downloadError) {
      setError(getAiErrorMessage(downloadError));
    } finally {
      if (downloadRef.current?.requestId === next.requestId) {
        downloadRef.current = null;
        setDownload(null);
      }
    }
  };

  if (!api?.dictation) {
    return <p className="text-sm text-text-subtle">Dictation is available in the HackDesk desktop app.</p>;
  }

  const locale = settings?.locale ?? status?.suggested ?? null;
  const localeLabels: Record<string, string> = {
    [SYSTEM_LOCALE_VALUE]: status?.suggested ? `System language (${describeDictationLocale(status.suggested)})` : 'System language',
    ...Object.fromEntries((status?.locales ?? []).map(id => [id, describeDictationLocale(id)])),
  };
  const sortedLocales = [...(status?.locales ?? [])].sort((a, b) => localeLabels[a]!.localeCompare(localeLabels[b]!));
  const needsDownload = Boolean(status?.available && locale && !status.installed.includes(locale));

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Dictation"
        description="Press ⇧⌘D in a note to dictate at the cursor, then ⇧⌘D or Enter to insert the text. macOS recognizes speech on this Mac; the audio is never saved or sent anywhere."
      >
        {error ? <p role="alert" className="text-sm text-destructive-default">{error}</p> : null}
        {!status || !settings ? (
          <p role="status" className="text-sm text-text-subtle">Checking…</p>
        ) : !status.available ? (
          <p className="text-sm text-text-subtle">{status.message}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <label htmlFor="settings-dictation-enabled" className="font-medium">Dictate into notes</label>
              <Switch
                id="settings-dictation-enabled"
                checked={settings.enabled}
                disabled={busy}
                onCheckedChange={checked => void handleEnabledChange(checked)}
              />
            </div>

            {settings.enabled ? (
              <div className="grid gap-2 text-sm">
                <label htmlFor="settings-dictation-locale" className="font-medium">Language</label>
                <Select
                  name="settings-dictation-locale"
                  value={settings.locale ?? SYSTEM_LOCALE_VALUE}
                  onValueChange={(value) => {
                    if (typeof value === 'string') void save({ ...settings, locale: value === SYSTEM_LOCALE_VALUE ? null : value });
                  }}
                  items={Object.entries(localeLabels).map(([value, label]) => ({ value, label }))}
                >
                  <SelectTrigger id="settings-dictation-locale" className="w-full">
                    <SelectLabelValue value={settings.locale ?? SYSTEM_LOCALE_VALUE} labels={localeLabels} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SYSTEM_LOCALE_VALUE}>{localeLabels[SYSTEM_LOCALE_VALUE]}</SelectItem>
                    {sortedLocales.map(id => <SelectItem key={id} value={id}>{localeLabels[id]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {settings.enabled && needsDownload && locale ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{describeDictationLocale(locale)} needs a one-time download</p>
                  <p className="text-xs leading-5 text-text-subtle">macOS downloads the speech model from Apple and shares it with other apps.</p>
                </div>
                {download?.locale === locale ? (
                  <Meter.Root value={Math.round(download.fraction * 100)} aria-label={`Downloading ${describeDictationLocale(locale)}`} className="flex items-center gap-3">
                    <Meter.Track className="h-1.5 w-24 overflow-hidden rounded-full bg-background-selected">
                      <Meter.Indicator className="h-full rounded-full bg-primary-default" />
                    </Meter.Track>
                    <span className="w-10 text-right text-xs tabular-nums text-text-subtle">{Math.round(download.fraction * 100)}%</span>
                  </Meter.Root>
                ) : (
                  <Button variant="secondary" size="sm" disabled={Boolean(download)} onClick={() => void startDownload(locale)}>
                    {download
                      ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                      : <Download aria-hidden="true" className="h-3.5 w-3.5" />}
                    Download
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
