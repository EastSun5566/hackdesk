import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

// Component that throws an error
const ThrowError = () => {
  throw new Error('Test error');
};

// Component that renders normally
const NormalComponent = () => <div>Test content</div>;

describe('ErrorBoundary', () => {
  it('should render children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <NormalComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should catch and display error when child component throws', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    // Check for error UI elements - match actual text
    expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('should have a reload button when error occurs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    const reloadButton = screen.getByRole('button', { name: /reload/i });
    expect(reloadButton).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
