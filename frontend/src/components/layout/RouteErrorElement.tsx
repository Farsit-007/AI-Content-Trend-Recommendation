import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * React Router's `errorElement`. Complements `RouteErrorBoundary`, which catches render errors inside
 * a single dashboard page — this one is the router's own last resort, so it also catches failures
 * outside any routed page (a lazy chunk that fails to load, an error thrown by a layout element).
 *
 * A failed chunk fetch is the case worth special-casing: it usually means a new deploy replaced the
 * hashed asset this tab was pointing at, and a plain reload genuinely fixes it — so say that rather
 * than showing a generic error the user can only guess at.
 */
export function RouteErrorElement() {
  const error = useRouteError();
  const navigate = useNavigate();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  const isStaleChunk =
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="bg-destructive/10 flex size-11 items-center justify-center rounded-full">
          <AlertTriangle className="text-destructive size-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">
            {isStaleChunk ? 'A newer version is available' : 'Something went wrong'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isStaleChunk
              ? 'This tab was running an older build. Reload to pick up the current one.'
              : 'The page could not be displayed. Reload to try again, or head back to the dashboard.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()} size="sm">
            <RotateCcw className="size-4" />
            Reload
          </Button>
          {!isStaleChunk && (
            <Button onClick={() => navigate('/dashboard')} variant="outline" size="sm">
              <Home className="size-4" />
              Dashboard
            </Button>
          )}
        </div>
        {import.meta.env.DEV && (
          <pre className="bg-muted text-muted-foreground max-w-full overflow-x-auto rounded-md p-3 text-left text-xs">
            {message}
          </pre>
        )}
      </div>
    </div>
  );
}
