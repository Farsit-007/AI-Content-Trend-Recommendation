import { Skeleton } from "@/components/ui/skeleton"

export default function GenerateSkeleton() {
  return (
    <div className="space-y-4">
      {["Facebook Post", "Reel Script", "LinkedIn", "YouTube Idea", "Caption"].map((label) => (
        <div key={label} className="glass-card rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  )
}
