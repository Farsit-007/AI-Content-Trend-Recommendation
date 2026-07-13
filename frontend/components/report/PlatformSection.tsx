"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Users, Play, Briefcase, Clock, BarChart2 } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import MiniSparkline from "./MiniSparkline"
import type { PlatformSummary } from "@/lib/mock/report"

const PLATFORM_META: Record<
  PlatformSummary["platform"],
  { label: string; icon: React.ElementType; color: string }
> = {
  facebook: { label: "Facebook", icon: Users, color: "text-info" },
  youtube: { label: "YouTube", icon: Play, color: "text-destructive" },
  linkedin: { label: "LinkedIn", icon: Briefcase, color: "text-info" },
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

type Props = { summary: PlatformSummary }

export default function PlatformSection({ summary }: Props) {
  const [open, setOpen] = useState(false)
  const meta = PLATFORM_META[summary.platform]
  const Icon = meta.icon
  const maxBreakdown = Math.max(...summary.content_breakdown.map((b) => b.avg_engagement_rate))

  return (
    <Card className="glass-card mb-4">
      <CardHeader
        className="flex flex-row items-center justify-between cursor-pointer select-none py-4"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <Icon className={`size-5 ${meta.color}`} />
          <span className="font-semibold">{meta.label}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {fmt(summary.reach)} reach · {summary.engagement_rate.toFixed(1)}% eng rate
          </span>
        </div>
        <div className="flex items-center gap-3">
          <MiniSparkline data={summary.sparkline} />
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-5">
          {/* Top posts */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Top Posts
            </p>
            <div className="space-y-2">
              {summary.top_posts.map((post, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-muted-foreground line-clamp-1 flex-1">{post.title}</span>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-muted-foreground">{fmt(post.reach)} reach</span>
                    <span className="text-xs text-success ml-2">
                      {((post.engagement / post.reach) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Best time */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Best time to post:</span>
            <span className="text-primary font-medium">{summary.best_time}</span>
          </div>

          {/* Content breakdown */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="size-4 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Content Breakdown (avg eng rate)
              </p>
            </div>
            <div className="space-y-2">
              {summary.content_breakdown.map((b) => (
                <div key={b.format} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{b.format}</span>
                    <span className="text-foreground font-medium">
                      {b.avg_engagement_rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${(b.avg_engagement_rate / maxBreakdown) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
