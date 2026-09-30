import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Command, CommandInput, CommandItem, CommandList } from './command';

describe('Command item availability', () => {
  it('allows enabled items and skips disabled items when using the keyboard', () => {
    const onSelect = vi.fn();
    render(
      <Command>
        <CommandInput aria-label="Search commands" />
        <CommandList>
          <CommandItem value="first" onSelect={onSelect}>First</CommandItem>
          <CommandItem value="unavailable" disabled onSelect={onSelect}>Unavailable</CommandItem>
          <CommandItem value="last" onSelect={onSelect}>Last</CommandItem>
        </CommandList>
      </Command>,
    );

    expect(screen.getByRole('option', { name: 'First' })).toHaveAttribute('data-disabled', 'false');
    expect(screen.getByRole('option', { name: 'Unavailable' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('option', { name: 'First' }));
    expect(onSelect).toHaveBeenLastCalledWith('first');
    fireEvent.click(screen.getByRole('option', { name: 'Unavailable' }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Last' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('last');
  });
});
