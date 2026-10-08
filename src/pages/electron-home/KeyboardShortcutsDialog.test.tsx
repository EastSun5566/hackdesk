import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';

function fixture(extra = {}) {
  return render(<KeyboardShortcutsDialog open region="tabs" returnFocus={null} platform="darwin" characterShortcutsEnabled onOpenChange={vi.fn()} onCustomize={vi.fn()} {...extra} />);
}
describe('keyboard shortcuts help', () => {
  it('opens search and distinguishes widget keys, current region and all actions', async () => {
    fixture();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search keyboard shortcuts' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Current Region: Tabs' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Move tab focus')).toBeInTheDocument();
    expect(screen.queryByText('New Folder')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All Actions' }));
    expect(screen.getByText('New Folder')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'half page' } });
    expect(screen.getByText('Scroll Half Page Down')).toBeInTheDocument();
    expect(screen.queryByText('New Folder')).not.toBeInTheDocument();
  });
  it('shows actual custom keys and disabled status, and opens customization', () => {
    const onCustomize = vi.fn();
    fixture({ shortcuts: { 'show-keyboard-shortcuts': 'mod+j', 'focus-next-tab': 'none' }, characterShortcutsEnabled: false, onCustomize });
    expect(screen.getByText('⌘J')).toBeInTheDocument();
    expect(screen.queryByText('⌃Tab')).not.toBeInTheDocument();
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Customize in Settings' }));
    expect(onCustomize).toHaveBeenCalledOnce();
  });
});
