import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Loading placeholder shaped like the table it replaces, so nothing jumps on resolve. */
function TableSkeleton({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div data-slot="table-skeleton" className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-3 border-b border-border/60 px-4 py-4 last:border-0 dark:border-white/5"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn("h-4 flex-1", colIndex === 0 && "max-w-[40%]")}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export { TableSkeleton }
