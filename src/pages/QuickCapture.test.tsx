import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HackDeskQuickCaptureAPI } from '@/lib/electron-api';

import { QUICK_CAPTURE_BUFFER_STORAGE_KEY, QuickCapture } from './QuickCapture';

function renderQuickCapture(appOverrides: Partial<HackDeskQuickCaptureAPI> = {}) {
  const api = {
    hide: vi.fn(async () => undefined),
    submit: vi.fn(async () => ({ accepted: true as const })),
    ...appOverrides,
  } satisfies HackDeskQuickCaptureAPI;
  window.hackdeskQuickCaptureAPI = api;
  render(<QuickCapture />);
  return api;
}

describe('QuickCapture', () => {
  afterEach(() => {
    window.localStorage.clear();
    delete window.hackdeskQuickCaptureAPI;
  });

  it('focuses the textarea on mount and whenever the window regains focus', async () => {
    renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');
    const captureButton = screen.getByRole('button', { name: 'Capture' });

    await waitFor(() => expect(textarea).toHaveFocus());
    captureButton.focus();
    expect(captureButton).toHaveFocus();

    fireEvent.focus(window);

    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('persists capture text and restores it after remounting', async () => {
    window.localStorage.setItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY, JSON.stringify({
      version: 1,
      content: 'Saved locally',
    }));

    renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');
    expect(textarea).toHaveValue('Saved locally');

    fireEvent.change(textarea, { target: { value: 'Updated locally' } });
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      content: 'Updated locally',
    }));
  });

  it('submits non-empty capture text with Cmd+Enter and clears the accepted buffer', async () => {
    const api = renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');

    fireEvent.change(textarea, { target: { value: '  # Captured\nBody  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('  # Captured\nBody  '));
    await waitFor(() => expect(textarea).toHaveValue(''));
    expect(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY)).toBeNull();
  });

  it('keeps blank captures in the window and shows an error', async () => {
    const api = renderQuickCapture();

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Write something before capturing.');
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('hides with Escape from any focused control without clearing the capture buffer', async () => {
    const api = renderQuickCapture();
    const textarea = screen.getByLabelText('Capture note');

    fireEvent.change(textarea, { target: { value: 'Keep this' } });
    const captureButton = screen.getByRole('button', { name: 'Capture' });
    captureButton.focus();
    fireEvent.keyDown(captureButton, { key: 'Escape' });

    await waitFor(() => expect(api.hide).toHaveBeenCalledOnce());
    expect(textarea).toHaveValue('Keep this');
    expect(window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY)).toContain('Keep this');
  });

  it('keeps rejected capture text and shows the rejection reason', async () => {
    const api = renderQuickCapture({
      submit: vi.fn(async () => ({
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
    expect(api.hide).not.toHaveBeenCalled();
  });

  it('keeps capture text when the IPC request fails', async () => {
    renderQuickCapture({
      submit: vi.fn(async () => {
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
      submit: vi.fn(() => new Promise((resolve) => {
        resolveSubmission = resolve;
      })),
    });
    const textarea = screen.getByLabelText('Capture note');
    fireEvent.change(textarea, { target: { value: 'Pending capture' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    await waitFor(() => expect(textarea).toBeDisabled());
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(api.hide).toHaveBeenCalledOnce();
    await act(async () => resolveSubmission?.({ accepted: true }));
  });
});
