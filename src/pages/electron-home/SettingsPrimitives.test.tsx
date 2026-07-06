import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SettingsSecretInput } from './SettingsPrimitives';

function ControlledSecretInput() {
  const [visible, setVisible] = useState(false);

  return (
    <label>
      API token
      <SettingsSecretInput
        visible={visible}
        onVisibleChange={setVisible}
        value="secret-token"
        onChange={() => undefined}
      />
    </label>
  );
}

describe('SettingsSecretInput', () => {
  it('uses a pressed toggle to show and hide the token', () => {
    render(<ControlledSecretInput />);

    const input = screen.getByLabelText('API token');
    const showButton = screen.getByRole('button', { name: 'Show token' });

    expect(input).toHaveAttribute('type', 'password');
    expect(showButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(showButton);

    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide token' })).toHaveAttribute('aria-pressed', 'true');
  });
});
