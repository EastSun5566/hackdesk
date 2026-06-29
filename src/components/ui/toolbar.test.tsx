import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar, ToolbarButton } from './toolbar';

describe('Toolbar', () => {
  it('uses one tab stop and loops horizontal arrow-key focus', async () => {
    render(
      <Toolbar aria-label="Editor actions">
        <ToolbarButton>First</ToolbarButton>
        <ToolbarButton disabled>Disabled</ToolbarButton>
        <ToolbarButton>Last</ToolbarButton>
      </Toolbar>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Editor actions' });
    const first = screen.getByRole('button', { name: 'First' });
    const disabled = screen.getByRole('button', { name: 'Disabled' });
    const last = screen.getByRole('button', { name: 'Last' });

    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(disabled).toHaveAttribute('tabindex', '-1');
    expect(last).toHaveAttribute('tabindex', '-1');

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    await waitFor(() => expect(disabled).toHaveFocus());

    fireEvent.keyDown(disabled, { key: 'ArrowRight' });
    await waitFor(() => expect(last).toHaveFocus());

    fireEvent.keyDown(last, { key: 'ArrowRight' });
    await waitFor(() => expect(first).toHaveFocus());

    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    await waitFor(() => expect(last).toHaveFocus());
  });

  it('keeps disabled actions focusable without invoking them', () => {
    const onClick = vi.fn();
    render(
      <Toolbar aria-label="Editor actions">
        <ToolbarButton disabled onClick={onClick}>Save</ToolbarButton>
      </Toolbar>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('data-focusable');
    expect(button).toHaveClass('focus-visible:ring-2');

    button.focus();
    fireEvent.click(button);

    expect(button).toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
  });
});
