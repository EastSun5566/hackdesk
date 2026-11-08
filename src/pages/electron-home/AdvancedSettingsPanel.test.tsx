import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdvancedSettingsPanel } from './AdvancedSettingsPanel';
import { readSplitStatusLine, SPLIT_STATUS_LINE_KEY } from './split-status-line-preference';

describe('AdvancedSettingsPanel', () => {
  afterEach(() => {
    window.localStorage.removeItem(SPLIT_STATUS_LINE_KEY);
  });

  it('toggles the split status line experiment', () => {
    render(<AdvancedSettingsPanel onResetAllSettings={vi.fn()} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(readSplitStatusLine()).toBe(true);
    expect(toggle).toBeChecked();
  });
});
