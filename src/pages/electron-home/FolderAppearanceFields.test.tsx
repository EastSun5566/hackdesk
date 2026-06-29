import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { FolderAppearanceFields } from './FolderAppearanceFields';

function FolderAppearanceFieldsHarness() {
  const [icon, setIcon] = useState('1F4C1');
  const [color, setColor] = useState('#2F80ED');

  return (
    <FolderAppearanceFields
      icon={icon}
      color={color}
      onIconChange={setIcon}
      onColorChange={setColor}
    />
  );
}

describe('FolderAppearanceFields', () => {
  it('keeps custom values mounted and preserves edits across collapse', () => {
    render(<FolderAppearanceFieldsHarness />);

    const trigger = screen.getByRole('button', { name: 'Custom values' });
    const iconInput = screen.getByLabelText('Icon codepoint');
    const colorInput = screen.getByLabelText('Color hex');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(iconInput).not.toBeVisible();

    fireEvent.click(trigger);
    fireEvent.change(iconInput, { target: { value: '1F680' } });
    fireEvent.change(colorInput, { target: { value: '#EB5757' } });
    fireEvent.click(trigger);

    expect(iconInput).not.toBeVisible();
    expect(iconInput).toHaveValue('1F680');
    expect(colorInput).toHaveValue('#EB5757');

    fireEvent.click(trigger);
    expect(iconInput).toBeVisible();
    expect(colorInput).toBeVisible();
  });
});
