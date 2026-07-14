"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Check, ExternalLink, Flame, Pencil, ShieldAlert, TrendingUp, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

const defaultCategoryColor = "bg-accent/10 text-accent-foreground border-accent/20"

type Props = {
  item: NewsItem
  categories: string[]
  onRecategorize: (category: string) => Promise<void> | void
  onScoreChange: (score: number) => Promise<void> | void
}

export default function NewsCard({ item, categories, onRecategorize, onScoreChange }: Props) {
  const [editingScore, setEditingScore] = useState(false)
  const [scoreDraft, setScoreDraft] = useState(String(item.opportunity_score.toFixed(1)))

  async function saveScore() {
    const parsed = Number(scoreDraft)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 10) {
      await onScoreChange(parsed)
    }
    setEditingScore(false)
  }

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Card className="glass-card h-full flex flex-col hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
        <CardContent className="flex flex-col gap-3 p-4 h-full">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Select value={item.category} onValueChange={(value) => onRecategorize(value)}>
              <SelectTrigger
                size="sm"
                className={cn(
                  "h-auto min-h-0 px-2 py-0.5 text-xs border rounded-full",
                  categoryColors[item.category] ?? defaultCategoryColor,
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.is_overridden && (
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 border text-primary border-primary/30 bg-primary/10"
              >
                <Pencil className="size-3 mr-1" />
                Overridden
              </Badge>
            )}
            {item.needs_review && (
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 border text-warning border-warning/30 bg-warning/10"
              >
                <ShieldAlert className="size-3 mr-1" />
                Needs review
              </Badge>
            )}
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
              <span className="tabular-nums">{item.trend_score.toFixed(1)} trend</span>
              <span>·</span>
              {editingScore ? (
                <span className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={scoreDraft}
                    onChange={(e) => setScoreDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveScore()
                      if (e.key === "Escape") setEditingScore(false)
                    }}
                    className="h-6 w-14 px-1.5 py-0 text-xs tabular-nums"
                  />
                  <button onClick={saveScore} className="text-success hover:opacity-80">
                    <Check className="size-3.5" />
                  </button>
                  <button onClick={() => setEditingScore(false)} className="text-muted-foreground hover:opacity-80">
                    <X className="size-3.5" />
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setScoreDraft(String(item.opportunity_score.toFixed(1)))
                    setEditingScore(true)
                  }}
                  className="tabular-nums hover:text-primary transition-colors"
                  title="Click to adjust opportunity score"
                >
                  {item.opportunity_score.toFixed(1)} opportunity
                </button>
              )}
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
