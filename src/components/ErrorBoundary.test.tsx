import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

// Component that throws an error
const ThrowError = () => {
  throw new Error('Test error');
};

// Component that renders normally
const NormalComponent = () => <div>Test content</div>;
const preventExpectedError = (event: ErrorEvent) => event.preventDefault();

describe('ErrorBoundary', () => {
  beforeEach(() => {
    window.addEventListener('error', preventExpectedError);
  });

  afterEach(() => {
    window.removeEventListener('error', preventExpectedError);
    delete window.hackdeskAPI;
    vi.restoreAllMocks();
  });

  it('should render children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <NormalComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('shows the fatal error surface with compact error details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => { });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'HackDesk hit an error' })).toBeInTheDocument();
    expect(screen.getByText('Try to recover the current view, reload the app, or export debug logs if this keeps happening.')).toBeInTheDocument();
    expect(screen.getByText('Error details')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('resets the error boundary when Try again is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const onReset = vi.fn();
    const RecoverableCrash = () => {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <ErrorBoundary onReset={() => {
          onReset();
          setShouldThrow(false);
        }}
        >
          {shouldThrow ? <ThrowError /> : <NormalComponent />}
        </ErrorBoundary>
      );
    };

    render(<RecoverableCrash />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('reloads the app when Reload app is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        href: window.location.href,
        reload,
      },
    });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reload app' }));

    expect(reload).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('hides debug log export outside Electron', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(screen.queryByRole('button', { name: 'Export debug logs' })).not.toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('exports debug logs through the Electron API', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const exportDebugLogs = vi.fn(async () => '/tmp/hackdesk-debug');
    window.hackdeskAPI = {
      getRuntimeEnvironment: () => 'electron',
      app: {
        exportDebugLogs,
        recordFatalRendererError: vi.fn(async () => undefined),
      },
    } as typeof window.hackdeskAPI;

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export debug logs' }));

    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
    await waitFor(() => expect(exportDebugLogs).toHaveBeenCalledOnce());
    expect(await screen.findByText('Debug logs exported to /tmp/hackdesk-debug.')).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('shows inline debug export failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const exportDebugLogs = vi.fn(async () => {
      throw new Error('Cannot write logs');
    });
    window.hackdeskAPI = {
      getRuntimeEnvironment: () => 'electron',
      app: {
        exportDebugLogs,
        recordFatalRendererError: vi.fn(async () => undefined),
      },
    } as typeof window.hackdeskAPI;

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export debug logs' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Cannot write logs');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('reports fatal renderer errors through the Electron API', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const recordFatalRendererError = vi.fn(async () => undefined);
    window.hackdeskAPI = {
      getRuntimeEnvironment: () => 'electron',
      app: {
        exportDebugLogs: vi.fn(async () => '/tmp/hackdesk-debug'),
        recordFatalRendererError,
      },
    } as typeof window.hackdeskAPI;

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(recordFatalRendererError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Test error',
      url: expect.any(String),
      userAgent: expect.any(String),
      platform: expect.any(String),
    }));
    expect(consoleSpy).toHaveBeenCalled();
  });
});
