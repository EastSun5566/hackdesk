import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HackDeskQuickCaptureAPI, QuickCaptureState } from '@/lib/electron-api';

import { QUICK_CAPTURE_BUFFER_STORAGE_KEY, QuickCapture } from './QuickCapture';

function renderQuickCapture(appOverrides: Partial<HackDeskQuickCaptureAPI> = {}, initialState: QuickCaptureState = { pinned: false }) {
  let stateListener: ((state: QuickCaptureState) => void) | null = null;
  const api = {
    hide: vi.fn(async () => undefined),
    submit: vi.fn(async () => ({ accepted: true as const })),
    getState: vi.fn(async () => initialState),
    setPinned: vi.fn(async (pinned: boolean) => ({ pinned })),
    onStateChange: vi.fn((listener: (state: QuickCaptureState) => void) => {
      stateListener = listener;
      return () => {
        stateListener = null;
      };
    }),
    ...appOverrides,
  } satisfies HackDeskQuickCaptureAPI;
  window.hackdeskQuickCaptureAPI = api;
  render(<QuickCapture />);
  return { api, emitState: (state: QuickCaptureState) => act(() => stateListener?.(state)) };
}

async function getEditor() {
  const content = await screen.findByLabelText('Quick Hack note');
  const view = EditorView.findFromDOM(content)!;
  return {
    content,
    text: () => view.state.doc.toString(),
    type: (text: string) => act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } });
    }),
  };
}

const storedBuffer = () => window.localStorage.getItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY);

describe('QuickCapture', () => {
  afterEach(() => {
    window.localStorage.clear();
    delete window.hackdeskQuickCaptureAPI;
  });

  it('focuses the editor on mount and whenever the window regains focus', async () => {
    renderQuickCapture();
    const { content } = await getEditor();
    const captureButton = screen.getByRole('button', { name: 'Capture' });

    await waitFor(() => expect(content).toHaveFocus());
    captureButton.focus();
    expect(captureButton).toHaveFocus();

    fireEvent.focus(window);

    await waitFor(() => expect(content).toHaveFocus());
  });

  it('persists capture text and restores it after remounting', async () => {
    window.localStorage.setItem(QUICK_CAPTURE_BUFFER_STORAGE_KEY, JSON.stringify({
      version: 1,
      content: 'Saved locally',
    }));

    renderQuickCapture();
    const editor = await getEditor();
    expect(editor.text()).toBe('Saved locally');

    editor.type('Updated locally');
    await waitFor(() => expect(JSON.parse(storedBuffer() ?? '{}')).toEqual({
      version: 1,
      content: 'Updated locally',
    }));
  });

  it('submits non-empty capture text with Mod+Enter and clears the accepted buffer', async () => {
    const { api } = renderQuickCapture();
    const editor = await getEditor();

    editor.type('  # Captured\nBody  ');
    fireEvent.keyDown(editor.content, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('  # Captured\nBody  '));
    await waitFor(() => expect(editor.text()).toBe(''));
    expect(storedBuffer()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('keeps blank captures in the window and shows an error', async () => {
    const { api } = renderQuickCapture();
    const { content } = await getEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Write something before capturing.');
    expect(content).toHaveAttribute('aria-invalid', 'true');
    expect(content).toHaveAttribute('aria-describedby', 'quick-capture-error');
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('hides with Escape from any focused control without clearing the capture buffer', async () => {
    const { api } = renderQuickCapture();
    const editor = await getEditor();

    editor.type('Keep this');
    const captureButton = screen.getByRole('button', { name: 'Capture' });
    captureButton.focus();
    fireEvent.keyDown(captureButton, { key: 'Escape' });

    await waitFor(() => expect(api.hide).toHaveBeenCalledOnce());
    expect(editor.text()).toBe('Keep this');
    expect(storedBuffer()).toContain('Keep this');
  });

  it('keeps rejected capture text and shows the rejection reason', async () => {
    const { api } = renderQuickCapture({
      submit: vi.fn(async () => ({
        accepted: false as const,
        error: 'Connect HackMD in Settings before capturing here.',
      })),
    });
    const editor = await getEditor();

    editor.type('Unsynced capture');
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Connect HackMD in Settings before capturing here.');
    expect(editor.text()).toBe('Unsynced capture');
    await waitFor(() => expect(editor.content).toHaveFocus());
    expect(storedBuffer()).toContain('Unsynced capture');
    expect(api.hide).not.toHaveBeenCalled();
  });

  it('rejects submission and keeps the text when the capture cannot be backed up', async () => {
    const { api } = renderQuickCapture();
    const editor = await getEditor();
    editor.type('Storage is full');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not persist this capture');
    expect(api.submit).not.toHaveBeenCalled();
    expect(editor.text()).toBe('Storage is full');
    setItem.mockRestore();
  });

  it('keeps capture text when the IPC request fails', async () => {
    renderQuickCapture({
      submit: vi.fn(async () => {
        throw new Error('HackDesk IPC is unavailable.');
      }),
    });
    const editor = await getEditor();

    editor.type('Recover this capture');
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('HackDesk IPC is unavailable.');
    expect(editor.text()).toBe('Recover this capture');
    await waitFor(() => expect(editor.content).toHaveFocus());
    expect(storedBuffer()).toContain('Recover this capture');
  });

  it('allows hiding while a capture submission is pending', async () => {
    let resolveSubmission: ((result: { accepted: true }) => void) | undefined;
    const { api } = renderQuickCapture({
      submit: vi.fn(() => new Promise<{ accepted: true }>((resolve) => {
        resolveSubmission = resolve;
      })),
    });
    const editor = await getEditor();
    editor.type('Pending capture');
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    await waitFor(() => expect(editor.content).toHaveAttribute('contenteditable', 'false'));
    expect(screen.getByRole('status')).toHaveTextContent('Capturing…');
    // A second submit while the first is in flight does nothing.
    fireEvent.keyDown(editor.content, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(api.hide).toHaveBeenCalledOnce();
    expect(api.submit).toHaveBeenCalledOnce();
    await act(async () => resolveSubmission?.({ accepted: true }));
  });

  it('shows the pin from the main process and toggles it by button and shortcut', async () => {
    const { api, emitState } = renderQuickCapture({}, { pinned: true });
    await getEditor();
    const pin = screen.getByRole('button', { name: 'Pin Quick Hack' });

    await waitFor(() => expect(pin).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(pin);
    await waitFor(() => expect(pin).toHaveAttribute('aria-pressed', 'false'));
    expect(api.setPinned).toHaveBeenLastCalledWith(false);

    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(pin).toHaveAttribute('aria-pressed', 'true'));
    expect(api.setPinned).toHaveBeenLastCalledWith(true);

    // Dismissing the popup resets the pin from the main process.
    emitState({ pinned: false });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
  });

  it('reverts the pin when the main process refuses it', async () => {
    renderQuickCapture({ setPinned: vi.fn(async () => { throw new Error('IPC down'); }) });
    await getEditor();
    const pin = screen.getByRole('button', { name: 'Pin Quick Hack' });

    fireEvent.click(pin);

    await waitFor(() => expect(pin).toHaveAttribute('aria-pressed', 'false'));
  });

  it('clears and stays ready for the next idea after a pinned capture', async () => {
    const { api } = renderQuickCapture({}, { pinned: true });
    const editor = await getEditor();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pin Quick Hack' })).toHaveAttribute('aria-pressed', 'true'));

    editor.type('- first idea');
    fireEvent.keyDown(editor.content, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('- first idea'));
    expect(await screen.findByRole('status')).toHaveTextContent('Captured');
    expect(editor.text()).toBe('');
    await waitFor(() => expect(editor.content).toHaveFocus());
    expect(api.hide).not.toHaveBeenCalled();

    editor.type('second');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
