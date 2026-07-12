import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';

import { QUICK_CAPTURE_BUFFER_STORAGE_KEY, QuickCapture } from './QuickCapture';

function renderQuickCapture(appOverrides: Partial<HackDeskElectronAPI['app']> = {}) {
  const api = {
    platform: 'darwin',
    app: {
      hideQuickCapture: vi.fn(async () => undefined),
      submitQuickCapture: vi.fn(async () => ({ accepted: true as const })),
      ...appOverrides,
    },
  } as unknown as HackDeskElectronAPI;
  window.hackdeskAPI = api;
  render(<QuickCapture />);
  return api;
}

describe('QuickCapture', () => {
  afterEach(() => {
    window.localStorage.clear();
    delete window.hackdeskAPI;
  });

  it('focuses the textarea on mount and whenever the window regains focus', async () => {
    renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');
    const hideButton = screen.getByRole('button', { name: 'Hide Quick Capture' });

    await waitFor(() => expect(textarea).toHaveFocus());
    hideButton.focus();
    expect(hideButton).toHaveFocus();

    fireEvent.focus(window);

    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('persists capture text and restores it after remounting', () => {
    window.localStorage.setItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY, JSON.stringify({
      version: 1,
      content: 'Saved locally',
    }));

    renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');
    expect(textarea).toHaveValue('Saved locally');

    fireEvent.change(textarea, { target: { value: 'Updated locally' } });
    expect(JSON.parse(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      content: 'Updated locally',
    });
  });

  it('submits non-empty capture text with Cmd+Enter and clears the accepted buffer', async () => {
    const api = renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');

    fireEvent.change(textarea, { target: { value: '  # Captured\nBody  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(api.app.submitQuickCapture).toHaveBeenCalledWith('  # Captured\nBody  '));
    await waitFor(() => expect(textarea).toHaveValue(''));
    expect(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY)).toBeNull();
  });

  it('keeps blank captures in the window and shows an error', async () => {
    const api = renderQuickCapture();

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Write something before capturing.');
    expect(api.app.submitQuickCapture).not.toHaveBeenCalled();
  });

  it('hides with Escape from any focused control without clearing the capture buffer', async () => {
    const api = renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');

    fireEvent.change(textarea, { target: { value: 'Keep this' } });
    const hideButton = screen.getByRole('button', { name: 'Hide Quick Capture' });
    hideButton.focus();
    fireEvent.keyDown(hideButton, { key: 'Escape' });

    await waitFor(() => expect(api.app.hideQuickCapture).toHaveBeenCalledOnce());
    expect(textarea).toHaveValue('Keep this');
    expect(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY)).toContain('Keep this');
  });

  it('hides from the header without clearing the capture buffer', async () => {
    const api = renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');

    fireEvent.change(textarea, { target: { value: 'Keep this too' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Quick Capture' }));

    await waitFor(() => expect(api.app.hideQuickCapture).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY)).toContain('Keep this too');
  });

  it('keeps rejected capture text and shows the rejection reason', async () => {
    const api = renderQuickCapture({
      submitQuickCapture: vi.fn(async () => ({
        accepted: false as const,
        error: 'Connect HackMD in Settings before capturing here.',
      })),
    });
    const textarea = screen.getByLabelText('Capture note');

    fireEvent.change(textarea, { target: { value: 'Unsynced capture' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Connect HackMD in Settings before capturing here.');
    expect(textarea).toHaveValue('Unsynced capture');
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY)).toContain('Unsynced capture');
    expect(api.app.hideQuickCapture).not.toHaveBeenCalled();
  });

  it('keeps capture text when the IPC request fails', async () => {
    renderQuickCapture({
      submitQuickCapture: vi.fn(async () => {
        throw new Error('HackDesk IPC is unavailable.');
      }),
    });
    const textarea = screen.getByLabelText('Capture note');

    fireEvent.change(textarea, { target: { value: 'Recover this capture' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('HackDesk IPC is unavailable.');
    expect(textarea).toHaveValue('Recover this capture');
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY)).toContain('Recover this capture');
  });

  it('allows hiding while a capture submission is pending', async () => {
    let resolveSubmission: ((result: { accepted: true }) => void) | undefined;
    const api = renderQuickCapture({
      submitQuickCapture: vi.fn(() => new Promise((resolve) => {
        resolveSubmission = resolve;
      })),
    });
    const textarea = screen.getByLabelText('Capture note');
    fireEvent.change(textarea, { target: { value: 'Pending capture' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    await waitFor(() => expect(textarea).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Hide Quick Capture' }));

    expect(api.app.hideQuickCapture).toHaveBeenCalledOnce();
    await act(async () => resolveSubmission?.({ accepted: true }));
  });
});
