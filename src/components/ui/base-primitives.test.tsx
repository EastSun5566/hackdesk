import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';
import { Field, FieldError, FieldLabel, Input, Textarea } from './field';
import { Toggle } from './toggle';

describe('Button', () => {
  it('defaults to type button and preserves explicit submit buttons', () => {
    render(
      <form>
        <Button>Cancel</Button>
        <Button type="submit">Save</Button>
      </form>,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('keeps Base UI disabled state available for styling and native semantics', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });

    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-disabled');
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Toggle', () => {
  function ControlledToggle() {
    const [pressed, setPressed] = useState(false);

    return (
      <Toggle pressed={pressed} onPressedChange={setPressed}>
        Pin tag
      </Toggle>
    );
  }

  it('exposes pressed state and updates via onPressedChange', () => {
    render(<ControlledToggle />);

    const toggle = screen.getByRole('button', { name: 'Pin tag' });

    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('data-pressed');
  });
});

describe('Field', () => {
  it('connects labels, invalid state, and errors to input controls', () => {
    render(
      <Field invalid>
        <FieldLabel htmlFor="workspace-title">Workspace title</FieldLabel>
        <Input id="workspace-title" aria-describedby="workspace-title-error" />
        <FieldError id="workspace-title-error" match>
          Title is required.
        </FieldError>
      </Field>,
    );

    const input = screen.getByLabelText('Workspace title');

    expect(input).toHaveAttribute('data-invalid');
    expect(input).toHaveAttribute('aria-describedby', 'workspace-title-error');
    expect(screen.getByText('Title is required.')).toBeVisible();
  });

  it('renders textarea as a native form control without breaking labels', () => {
    render(
      <form aria-label="Metadata">
        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea id="description" name="description" defaultValue="Draft summary" />
        </Field>
      </form>,
    );

    const textarea = screen.getByLabelText('Description');

    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveValue('Draft summary');
    expect(new FormData(screen.getByRole('form', { name: 'Metadata' }) as HTMLFormElement).get('description')).toBe('Draft summary');
  });
});
