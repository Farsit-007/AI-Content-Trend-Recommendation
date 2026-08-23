import * as React from "react"
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/** Mirrors EmptyState, but for a failed query. `onRetry` maps to react-query's `refetch`. */
function ErrorState({
  title = "Something went wrong",
  description,
  error,
  onRetry,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title?: string
  description?: string
  error?: unknown
  onRetry?: () => void
}) {
  const message =
    description ??
    (error instanceof Error && error.message ? error.message : "Please try again in a moment.")

  return (
    <div
      data-slot="error-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      <div className="flex size-10 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10">
        <AlertTriangleIcon className="size-5 text-destructive" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" onClick={onRetry}>
          <RefreshCwIcon />
          Try again
        </Button>
      )}
    </div>
  )
}

export { ErrorState }
