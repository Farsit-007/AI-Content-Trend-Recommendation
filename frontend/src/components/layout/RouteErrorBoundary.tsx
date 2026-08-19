import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/errorReporting';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors from one routed page.
 *
 * Scoped per-route on purpose: it sits *inside* MainLayout, so a page that throws leaves the sidebar
 * and topbar usable and the user can navigate away — previously any unexpected response shape (a
 * null where a string was assumed) blanked the whole dashboard with no recovery but a manual reload.
 *
 * Must be a class component: `componentDidCatch` has no hook equivalent.
 *
 * Retry resets local state rather than reloading the page. A remount is enough for the common cause
 * — a transient bad response, where TanStack Query refetches on mount — and preserves everything the
 * user had in memory. `key` is bumped so children fully remount rather than re-rendering with stale
 * internal state.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  private retryKey = 0;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RouteErrorBoundary] Unhandled render error', error, info.componentStack);
    reportError(error, { source: 'route-error-boundary', componentStack: info.componentStack });
  }

  private handleRetry = () => {
    this.retryKey += 1;
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return <div key={this.retryKey}>{this.props.children}</div>;
    }

    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <div className="bg-destructive/10 flex size-11 items-center justify-center rounded-full">
          <AlertTriangle className="text-destructive size-5" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">This page didn't load</h2>
          <p className="text-muted-foreground text-sm">
            Something went wrong rendering it. Try again, or pick another section from the sidebar.
          </p>
        </div>
        <Button onClick={this.handleRetry} variant="outline" size="sm">
          <RotateCcw className="size-4" />
          Try again
        </Button>
        {import.meta.env.DEV && (
          <pre className="bg-muted text-muted-foreground max-w-full overflow-x-auto rounded-md p-3 text-left text-xs">
            {error.message}
          </pre>
        )}
      </div>
    );
  }
}
