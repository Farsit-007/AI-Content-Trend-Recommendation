import * as React from "react"
import { InboxIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The single empty/zero-state surface for the dashboard. Pages used to hand-roll
 * three different versions of "nothing here yet" — this keeps them identical.
 */
function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/50 dark:bg-white/5">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export { EmptyState }
