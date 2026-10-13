import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CollapsibleSection } from './interaction-primitives';

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
