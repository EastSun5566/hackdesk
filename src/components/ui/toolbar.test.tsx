import { render, screen } from '@testing-library/react';
import { describe, it, vi } from 'vitest';

import { expectDisabledToolbarAction, expectToolbarRovingFocus } from '@/test/accessibility-contracts';

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

    await expectToolbarRovingFocus('Editor actions', ['First', 'Disabled', 'Last']);
  });

  it('keeps disabled actions focusable without invoking them', () => {
    const onClick = vi.fn();
    render(
      <Toolbar aria-label="Editor actions">
        <ToolbarButton disabled onClick={onClick}>Save</ToolbarButton>
      </Toolbar>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expectDisabledToolbarAction(button, onClick);
  });
});
