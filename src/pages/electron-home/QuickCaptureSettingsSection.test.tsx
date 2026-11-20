import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuickCaptureSettingsSection } from './QuickCaptureSettingsSection';

function installApi(keepOpen: boolean) {
  const settings = {
    get: vi.fn(async () => ({ quickCapture: { keepOpen } })),
    update: vi.fn(async (update: { quickCapture: { keepOpen: boolean } }) => ({ quickCapture: update.quickCapture })),
  };
  window.hackdeskAPI = { settings } as never;
  return settings;
}

describe('QuickCaptureSettingsSection', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('shows and saves whether Quick Hack stays open after capture', async () => {
    const settings = installApi(false);
    render(<QuickCaptureSettingsSection active />);
    const toggle = screen.getByRole('switch', { name: 'Keep open after capture' });

    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => expect(settings.update).toHaveBeenCalledWith({ quickCapture: { keepOpen: true } }));
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('resets to closing after capture from the page Reset', async () => {
    const settings = installApi(true);
    const { rerender } = render(<QuickCaptureSettingsSection active />);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Keep open after capture' })).toBeChecked());

    rerender(<QuickCaptureSettingsSection active resetSignal={1} />);

    await waitFor(() => expect(settings.update).toHaveBeenCalledWith({ quickCapture: { keepOpen: false } }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Keep open after capture' })).not.toBeChecked());
  });
});
