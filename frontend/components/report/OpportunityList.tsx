import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import type { ContentOpportunity } from "@/lib/mock/report"

type Props = { opportunities: ContentOpportunity[] }

const RANK_COLORS = [
  "text-warning",
  "text-muted-foreground",
  "text-warning/60",
  "text-muted-foreground",
  "text-muted-foreground",
]

export default function OpportunityList({ opportunities }: Props) {
  return (
    <div>
      <h3 className="font-semibold text-sm mb-3">Content Opportunities This Week</h3>
      <div className="space-y-3">
        {opportunities.map((opp) => (
          <div
            key={opp.rank}
            className="glass-card rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <span className={`text-2xl font-bold tabular-nums shrink-0 w-6 ${RANK_COLORS[opp.rank - 1]}`}>
              #{opp.rank}
            </span>

            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-medium line-clamp-1">{opp.topic}</p>
              <div className="flex flex-wrap gap-1">
                {opp.formats.map((f) => (
                  <Badge
                    key={f}
                    variant="outline"
                    className="text-xs px-1.5 py-0 border-primary/30 text-primary bg-primary/10"
                  >
                    {f}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{opp.reason}</p>
            </div>

            <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
              <span className="text-lg font-bold text-success tabular-nums">
                {opp.opportunity_score.toFixed(1)}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                asChild
              >
                <Link href={`/dashboard/generate?topic=${encodeURIComponent(opp.topic)}`}>
                  Generate
                  <ArrowRight className="size-3" />
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
