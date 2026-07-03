import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RepositoryNotice } from './RepositoryNotice';

describe('RepositoryNotice', () => {
  it('announces repository errors as alerts', () => {
    render(<RepositoryNotice error="Unable to load notes." cached={false} />);

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Unable to load notes.');
    expect(notice).toHaveClass('bg-destructive-soft');
    expect(notice).toHaveClass('text-destructive-default');
  });

  it('announces cached fallback as a polite status with compact copy', () => {
    render(<RepositoryNotice error="Sync failed." cached />);

    const notice = screen.getByRole('status');
    expect(notice).toHaveAttribute('aria-atomic', 'true');
    expect(notice).toHaveTextContent('Cached data. Sync failed.');
    expect(notice).toHaveClass('bg-primary-soft');
    expect(notice).toHaveClass('text-primary-default');
    expect(notice).not.toHaveClass('bg-destructive-soft');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
