import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CollapsibleSection, EntityRow } from './interaction-primitives';

describe('CollapsibleSection', () => {
  it('names its trigger with the title and the unsaved state', () => {
    render(<CollapsibleSection title="Metadata" dirty>Fields</CollapsibleSection>);

    expect(screen.getByRole('button', { name: 'Metadata, Unsaved changes' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('includes the subtitle in the trigger name', () => {
    render(<CollapsibleSection title="Tags" subtitle="3">Tags</CollapsibleSection>);

    expect(screen.getByRole('button', { name: 'Tags, 3' })).toBeInTheDocument();
  });
});

describe('EntityRow', () => {
  it('opens from anywhere on the row, not only its content', () => {
    const open = vi.fn();
    const control = vi.fn();
    const { container } = render(
      <EntityRow
        title="Plan"
        leadingControls={<button type="button" onClick={control}>Toggle</button>}
        contentOnClick={open}
        contentAriaLabel="Plan"
      />,
    );
    const row = container.firstElementChild as HTMLElement;

    // Its padding and the gaps around its controls belong to the row itself.
    fireEvent.click(row);
    expect(open).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(open).toHaveBeenCalledTimes(2);
    // A control in the row keeps its own click.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(control).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('EntityRow title weight', () => {
  const titleClasses = (props: { selected?: boolean; active?: boolean; tone?: 'default' | 'quiet' }) => {
    const { getByText, unmount } = render(<EntityRow title="Plan" {...props} />);
    const classes = getByText('Plan').className;
    unmount();
    return classes;
  };

  it('keeps a sidebar row at one weight when it is selected, so the row does not shift (#330)', () => {
    const resting = titleClasses({ tone: 'quiet' });
    expect(resting).toContain('font-normal');
    expect(titleClasses({ tone: 'quiet', selected: true })).toBe(resting);
    expect(titleClasses({ tone: 'quiet', active: true })).toBe(resting);
    // Other rows keep their medium weight, selected or not.
    expect(titleClasses({})).toContain('font-medium');
    expect(titleClasses({ selected: true })).toBe(titleClasses({}));
  });
});
