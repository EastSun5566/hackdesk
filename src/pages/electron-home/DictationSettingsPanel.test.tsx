import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DictationEvent, DictationStatus } from '@/lib/dictation';
import { defaultSettings, type DictationSettings } from '@/lib/settings';

import { DictationSettingsPanel } from './DictationSettingsPanel';

function installApi(status: DictationStatus, initial: DictationSettings = defaultSettings.dictation, confirmed = true) {
  let dictation = initial;
  const update = vi.fn(async (input: { dictation: DictationSettings }) => {
    dictation = input.dictation;
    return { dictation };
  });
  const install = vi.fn(async (_input: unknown, onEvent: (event: DictationEvent) => void) => {
    onEvent({ type: 'progress', fraction: 0.5 });
    return true;
  });
  window.hackdeskAPI = {
    getRuntimeEnvironment: () => 'electron',
    settings: { get: vi.fn(async () => ({ dictation })), update },
    app: { confirm: vi.fn(async () => ({ confirmed })) },
    dictation: { status: vi.fn(async () => status), install, start: vi.fn(), stop: vi.fn(), cancel: vi.fn(async () => undefined) },
  } as unknown as typeof window.hackdeskAPI;
  return { update, install };
}

const ready: DictationStatus = { available: true, message: null, locales: ['en-US', 'zh-TW'], installed: ['en-US'], suggested: 'en-US' };

afterEach(() => {
  delete window.hackdeskAPI;
});

describe('DictationSettingsPanel', () => {
  it('explains why dictation is unavailable instead of offering it', async () => {
    installApi({ ...ready, available: false, message: 'Dictation needs macOS 26 or later.', locales: [] });
    render(<DictationSettingsPanel active />);
    expect(await screen.findByText('Dictation needs macOS 26 or later.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('turns on only after consent', async () => {
    const { update } = installApi(ready, defaultSettings.dictation, false);
    render(<DictationSettingsPanel active />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Dictate into notes' }));
    await waitFor(() => expect(window.hackdeskAPI!.app.confirm).toHaveBeenCalled());
    expect(update).not.toHaveBeenCalled();
  });

  it('offers a download for a language that is not installed yet', async () => {
    const { install } = installApi(ready, { enabled: true, locale: 'zh-TW' });
    render(<DictationSettingsPanel active />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(install).toHaveBeenCalledWith(expect.objectContaining({ locale: 'zh-TW' }), expect.any(Function)));
  });
});
