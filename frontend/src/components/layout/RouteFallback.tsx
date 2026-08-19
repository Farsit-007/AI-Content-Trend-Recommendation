import { Loader2 } from 'lucide-react';

/**
 * Suspense fallback for lazily-loaded dashboard pages. Deliberately matches ProtectedRoute's own
 * loading state so a role-gated page doesn't visibly swap between two different spinners while the
 * auth check and the chunk fetch resolve.
 */
export function RouteFallback() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center" role="status" aria-label="Loading page">
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
    </div>
  );
}
