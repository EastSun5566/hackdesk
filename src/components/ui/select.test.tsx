import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabelValue,
  SelectTrigger,
} from './select';

function TestSelect({
  onValueChange = vi.fn(),
  value = 'hackmd-neo',
}: {
  onValueChange?: (value: string) => void;
  value?: string;
}) {
  const labels = {
    'hackmd-neo': 'HackMD Neo',
    dracula: 'Dracula',
  };

  return (
    <Select value={value} onValueChange={(nextValue) => typeof nextValue === 'string' && onValueChange(nextValue)}>
      <SelectTrigger aria-label="Theme preset">
        <SelectLabelValue value={value} labels={labels} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="hackmd-neo">HackMD Neo</SelectItem>
        <SelectItem value="dracula">Dracula</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('SelectLabelValue', () => {
  it('renders the selected label instead of the raw stored value', () => {
    render(<TestSelect />);

    const trigger = screen.getByRole('combobox', { name: 'Theme preset' });

    expect(trigger).toHaveTextContent('HackMD Neo');
    expect(trigger).not.toHaveTextContent('hackmd-neo');
  });

  it('keeps option activation wired to the raw value', async () => {
    const onValueChange = vi.fn();
    render(<TestSelect onValueChange={onValueChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Theme preset' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    const option = await screen.findByRole('option', { name: 'Dracula' });
    fireEvent.pointerDown(option);
    fireEvent.click(option);

    expect(onValueChange).toHaveBeenCalledWith('dracula');
  });
});
