import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';
import { Field, FieldLabel, Textarea } from './field';

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

});

describe('Field', () => {
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
