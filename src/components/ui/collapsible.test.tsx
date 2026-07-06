import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';

describe('Collapsible', () => {
  it('uses native button semantics and retains focus while toggling', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Panel content</CollapsibleContent>
      </Collapsible>,
    );

    const trigger = screen.getByRole('button', { name: 'Details' });
    const content = screen.getByText('Panel content');

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(content).not.toBeVisible();

    trigger.focus();
    fireEvent.click(trigger);

    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(content).toBeVisible();
  });

  it('keeps form controls mounted and preserves their value while closed', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>
          <label htmlFor="collapsible-value">Value</label>
          <input id="collapsible-value" defaultValue="initial" />
        </CollapsibleContent>
      </Collapsible>,
    );

    const trigger = screen.getByRole('button', { name: 'Details' });
    const input = screen.getByLabelText('Value');
    fireEvent.change(input, { target: { value: 'edited' } });
    fireEvent.click(trigger);

    expect(input).toBeInTheDocument();
    expect(input).not.toBeVisible();
    expect(input).toHaveValue('edited');

    fireEvent.click(trigger);
    expect(input).toBeVisible();
    expect(input).toHaveValue('edited');
  });
});
