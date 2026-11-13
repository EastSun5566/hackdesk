import { useCallback, useEffect, useRef, useState } from 'react';

import { getAiErrorMessage } from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';
import { defaultQuickCaptureSettings, type QuickCaptureSettings } from '@/lib/settings';

import { SettingsSection, SettingsSwitchRow } from './SettingsPrimitives';

/** Whether Quick Hack starts pinned, staying open after each capture for the next one. */
export function QuickCaptureSettingsSection({ active, resetSignal = 0 }: { active: boolean; resetSignal?: number }) {
  const hackdesk = getHackDeskAPI();
  // Only an Electron window with settings access shows this section.
  const api = hackdesk?.settings ? hackdesk : undefined;
  const [settings, setSettings] = useState<QuickCaptureSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastResetSignal = useRef(0);

  useEffect(() => {
    if (!active || !api) return;
    void api.settings.get()
      .then(saved => setSettings(saved.quickCapture ?? defaultQuickCaptureSettings))
      .catch(() => undefined);
  }, [active, api]);

  const save = useCallback(async (next: Partial<QuickCaptureSettings>) => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.settings.update({ quickCapture: next });
      setSettings(current => saved.quickCapture ?? { ...defaultQuickCaptureSettings, ...current, ...next });
    } catch (saveError) {
      setError(getAiErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }, [api]);

  // The pin shortcut lives on the Shortcuts tab and resets there.
  const revertSection = useCallback(() => {
    void save({ keepOpen: defaultQuickCaptureSettings.keepOpen });
  }, [save]);

  // The header Reset button reaches this self-saving section through the page.
  useEffect(() => {
    if (!resetSignal || resetSignal === lastResetSignal.current) return;
    lastResetSignal.current = resetSignal;
    revertSection();
  }, [resetSignal, revertSection]);

  if (!api) return null;

  return (
    <SettingsSection
      title="Quick Hack"
      onRevert={revertSection}
      revertLabel="Keep Quick Hack open after capture"
    >
      {error ? <p role="alert" className="text-sm text-destructive-default">{error}</p> : null}
      <SettingsSwitchRow
        id="settings-quick-capture-keep-open"
        label="Keep open after capture"
        description="Each Quick Hack starts pinned, ready for the next idea. The pin in the popup changes this until it closes."
        checked={settings?.keepOpen ?? defaultQuickCaptureSettings.keepOpen}
        disabled={busy || !settings}
        onCheckedChange={checked => void save({ keepOpen: checked })}
      />
    </SettingsSection>
  );
}
