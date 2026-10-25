import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NoteComparisonView } from './NoteComparisonView';

vi.mock('./PierreComparison', () => ({ default: () => { throw new Error('Invalid patch'); } }));

it('shows original text when rendering fails, rather than claiming no changes', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<NoteComparisonView input={{ kind: 'patch', patch: 'invalid patch' }} beforeLabel="History" afterLabel="Saved" />);
    expect(await screen.findByRole('status')).toHaveTextContent('Could not render');
    expect(screen.getByText('invalid patch')).toBeInTheDocument();
    expect(screen.queryByText('No changes.')).not.toBeInTheDocument();
  } finally {
    errors.mockRestore();
  }
});

it('limits oversized previews but copies the complete original text', async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const patch = 'original line\n'.repeat(5_001);
  render(<NoteComparisonView input={{ kind: 'patch', patch }} beforeLabel="History" afterLabel="Saved" />);
  expect(screen.getByRole('status')).toHaveTextContent('exceeds');
  expect(screen.getByText(/Text preview is limited/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Copy full text' }));
  expect(writeText).toHaveBeenCalledWith(patch);
});

it('copies the intended side through native IPC when browser clipboard is denied', () => {
  const writeText = vi.fn(async () => {});
  const browserWrite = vi.fn(async () => { throw new Error('Clipboard permission denied'); });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: browserWrite } });
  window.hackdeskAPI = { app: { writeClipboardText: writeText } } as unknown as NonNullable<typeof window.hackdeskAPI>;
  try {
    render(<NoteComparisonView input={{ kind: 'text', before: 'Saved body', after: 'Draft body' }} beforeLabel="On disk" afterLabel="Your draft" />);
    fireEvent.click(screen.getByRole('button', { name: 'Plain text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy On disk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Your draft' }));
    expect(writeText.mock.calls).toEqual([['Saved body'], ['Draft body']]);
    expect(browserWrite).not.toHaveBeenCalled();
  } finally {
    delete window.hackdeskAPI;
  }
});
