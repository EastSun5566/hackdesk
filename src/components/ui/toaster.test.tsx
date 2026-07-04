import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toast, Toaster } from './toast';

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

describe('Toaster', () => {
  it('renders toast content as a polite status notification', async () => {
    render(<Toaster />);

    act(() => {
      toast.success('Note exported.', { description: '/tmp/note.md' });
    });

    expect(await screen.findByText('Note exported.')).toBeInTheDocument();
    expect(screen.getByText('/tmp/note.md')).toBeInTheDocument();

    const notification = screen.getByText('Note exported.').closest('[role="status"]');
    expect(notification).toHaveAttribute('aria-live', 'polite');
    expect(notification).toHaveAttribute('aria-atomic', 'true');
    expect(notification).toHaveClass('border-success-default/30');
  });

  it('keeps error toasts visible and readable without relying on color alone', async () => {
    render(<Toaster />);

    act(() => {
      toast.error('Failed to export note.', { description: 'Permission denied.' });
    });

    expect(await screen.findByText('Failed to export note.')).toBeInTheDocument();
    expect(screen.getByText('Permission denied.')).toBeInTheDocument();

    const notification = screen.getByText('Failed to export note.').closest('[role="status"]');
    expect(notification).toHaveClass('border-destructive-default/35');
    expect(notification?.querySelector('svg')).toBeInTheDocument();
  });

  it('renders an accessible action and close control', async () => {
    const onAction = vi.fn();
    render(<Toaster />);

    act(() => {
      toast.info('Update available.', {
        action: {
          label: 'Install',
          onClick: onAction,
        },
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(onAction).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Close notification' }));
    await waitFor(() => {
      expect(screen.queryByText('Update available.')).not.toBeInTheDocument();
    });
  });
});
