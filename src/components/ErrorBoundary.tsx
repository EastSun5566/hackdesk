import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}
interface State {
  hasError: boolean;
  error: Error | null;
  exportStatus: 'idle' | 'exporting' | 'success' | 'error';
  exportMessage: string | null;
}
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      exportStatus: 'idle',
      exportMessage: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      exportStatus: 'idle',
      exportMessage: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    void window.hackdeskAPI?.app.recordFatalRendererError?.({
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    }).catch(() => undefined);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      exportStatus: 'idle',
      exportMessage: null,
    });
    this.props.onReset?.();
  };

  handleExportDebugLogs = () => {
    const exportDebugLogs = window.hackdeskAPI?.app.exportDebugLogs;
    if (!exportDebugLogs) {
      return;
    }

    this.setState({
      exportStatus: 'exporting',
      exportMessage: 'Exporting debug logs…',
    });

    void exportDebugLogs()
      .then((path) => {
        this.setState({
          exportStatus: 'success',
          exportMessage: path ? `Debug logs exported to ${path}.` : 'Debug logs exported.',
        });
      })
      .catch((error) => {
        this.setState({
          exportStatus: 'error',
          exportMessage: error instanceof Error ? error.message : 'Failed to export debug logs.',
        });
      });
  };

  render() {
    if (this.state.hasError) {
      const canExportDebugLogs = Boolean(window.hackdeskAPI?.app.exportDebugLogs);
      const isExporting = this.state.exportStatus === 'exporting';
      const details = this.state.error?.message || 'An unexpected renderer error occurred.';

      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-background-muted p-8 text-text-default">
          <div className="w-full max-w-lg space-y-5 rounded-xl border border-border-default bg-background-default p-8 text-left shadow-lg">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-text-subtle">HackDesk</p>
              <h1 className="text-2xl font-semibold text-text-default text-balance">
                HackDesk hit an error
              </h1>
              <p className="text-sm leading-6 text-text-subtle text-pretty">
                Try to recover the current view, reload the app, or export debug logs if this keeps happening.
              </p>
            </div>

            <details className="rounded-lg border border-border-default bg-background-muted px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                Error details
              </summary>
              <p className="mt-2 break-words font-mono text-xs leading-5 text-text-subtle">
                {details}
              </p>
            </details>

            {this.state.exportMessage ? (
              <p
                role="status"
                className={this.state.exportStatus === 'error'
                  ? 'text-sm text-destructive-default'
                  : 'text-sm text-text-subtle'}
              >
                {this.state.exportMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={this.handleReset}>
                Try again
              </Button>
              <Button onClick={() => window.location.reload()}>
                Reload app
              </Button>
              {canExportDebugLogs ? (
                <Button onClick={this.handleExportDebugLogs} disabled={isExporting}>
                  {isExporting ? 'Exporting…' : 'Export debug logs'}
                </Button>
              ) : null}
            </div>

            <p className="text-xs leading-5 text-text-subtle">
              Local files and unsynced editor changes are not intentionally modified by this recovery screen.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
