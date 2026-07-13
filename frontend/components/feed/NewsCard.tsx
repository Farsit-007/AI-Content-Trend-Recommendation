"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ExternalLink, Flame, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { NewsItem } from "@/lib/mock/news"

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diffMs / 3_600_000)
  if (h < 1) return "just now"
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const categoryColors: Record<string, string> = {
  AI: "bg-primary/10 text-primary border-primary/20",
  "Web Dev": "bg-info/10 text-info border-info/20",
  Career: "bg-success/10 text-success border-success/20",
  Security: "bg-destructive/10 text-destructive border-destructive/20",
  DevOps: "bg-warning/10 text-warning border-warning/20",
  Other: "bg-muted text-muted-foreground border-border",
}

type Props = { item: NewsItem }

export default function NewsCard({ item }: Props) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Card className="glass-card h-full flex flex-col hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
        <CardContent className="flex flex-col gap-3 p-4 h-full">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn("text-xs px-2 py-0.5 border", categoryColors[item.category])}
            >
              {item.category}
            </Badge>
            {item.is_hot && (
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 border text-warning border-warning/30 bg-warning/10"
              >
                <Flame className="size-3 mr-1 animate-pulse" />
                Trending
              </Badge>
            )}
            {item.is_opportunity && (
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 border text-success border-success/30 bg-success/10"
              >
                <TrendingUp className="size-3 mr-1" />
                High opportunity
              </Badge>
            )}
          </div>

          {/* Title */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-1.5"
          >
            <span className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">
              {item.title}
            </span>
            <ExternalLink className="size-3 mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>

          {/* Snippet */}
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {item.snippet}
          </p>

          {/* Impact note */}
          {item.impact_note && (
            <p className="text-xs text-primary/70 italic leading-relaxed border-l-2 border-primary/30 pl-2">
              {item.impact_note}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">{item.source}</span>
              <span>·</span>
              <span>{timeAgo(item.published_at)}</span>
              <span>·</span>
              <span className="tabular-nums">
                {item.trend_score.toFixed(1)} score
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              asChild
            >
              <Link href={`/dashboard/generate?topic=${encodeURIComponent(item.title)}`}>
                Generate content
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
