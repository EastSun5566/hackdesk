import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';

import { QuickCapture } from './QuickCapture';

function renderQuickCapture(appOverrides: Partial<HackDeskElectronAPI['app']> = {}) {
  const api = {
    platform: 'darwin',
    app: {
      closeQuickCapture: vi.fn(async () => undefined),
      submitQuickCapture: vi.fn(async () => undefined),
      ...appOverrides,
    },
  } as unknown as HackDeskElectronAPI;
  window.hackdeskAPI = api;
  render(<QuickCapture />);
  return api;
}

describe('QuickCapture', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('submits non-empty capture text with Cmd+Enter', async () => {
    const api = renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');

    fireEvent.change(textarea, { target: { value: '# Captured\nBody' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(api.app.submitQuickCapture).toHaveBeenCalledWith('# Captured\nBody'));
  });

  it('keeps blank captures in the window and shows an error', async () => {
    const api = renderQuickCapture();

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Write something before capturing.');
    expect(api.app.submitQuickCapture).not.toHaveBeenCalled();
  });

  it('closes the capture window with Escape', async () => {
    const api = renderQuickCapture();

    fireEvent.keyDown(screen.getByLabelText('Capture note'), { key: 'Escape' });

    await waitFor(() => expect(api.app.closeQuickCapture).toHaveBeenCalledOnce());
  });
});
