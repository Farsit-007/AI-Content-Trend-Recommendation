import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Report } from "@/lib/mock/report"

type Props = {
  overview: Report["overview"]
}

function Delta({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-xs font-medium",
        positive ? "text-success" : "text-destructive"
      )}
    >
      {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  )
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function OverviewStats({ overview }: Props) {
  const stats = [
    { label: "Total Reach", value: fmt(overview.total_reach), delta: overview.delta_reach },
    { label: "Engagements", value: fmt(overview.total_engagements), delta: overview.delta_engagements },
    { label: "Video Views", value: fmt(overview.total_views), delta: overview.delta_views },
    {
      label: "Avg Eng. Rate",
      value: `${overview.avg_engagement_rate.toFixed(1)}%`,
      delta: overview.delta_engagement_rate,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {stats.map((s) => (
        <div key={s.label} className="glass-card rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="text-2xl font-bold gradient-text">{s.value}</p>
          <Delta value={s.delta} />
        </div>
      ))}
    </div>
  )
}
