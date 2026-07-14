"use client"

import { useState } from "react"
import { Zap, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import PageHeader from "@/components/shared/PageHeader"

type Status = "idle" | "running" | "complete"

type ActionCardProps = {
  icon: React.ElementType
  title: string
  description: string
  lastRun: string
  buttonLabel: string
  successMessage: string
  onRun?: () => Promise<string>
}

function ActionCard({
  icon: Icon,
  title,
  description,
  lastRun,
  buttonLabel,
  successMessage,
  onRun,
}: ActionCardProps) {
  const [status, setStatus] = useState<Status>("idle")

  async function handleRun() {
    if (status === "running") return
    setStatus("running")

    if (!onRun) {
      setTimeout(() => {
        setStatus("complete")
        toast.success(successMessage)
      }, 2000)
      return
    }

    try {
      const detail = await onRun()
      setStatus("complete")
      toast.success(successMessage, { description: detail })
    } catch (err) {
      setStatus("idle")
      toast.error(err instanceof Error ? err.message : "Request failed")
    }
  }

  return (
    <div className="glass-card rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Icon className="size-5 text-primary" />
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Last run: {lastRun}</p>
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "size-1.5 rounded-full",
                status === "idle" && "bg-muted-foreground",
                status === "running" && "bg-warning animate-pulse",
                status === "complete" && "bg-success"
              )}
            />
            <span
              className={cn(
                status === "idle" && "text-muted-foreground",
                status === "running" && "text-warning",
                status === "complete" && "text-success"
              )}
            >
              {status === "idle" && "Idle"}
              {status === "running" && "Running…"}
              {status === "complete" && "Complete"}
            </span>
          </div>
        </div>

        <Button
          onClick={handleRun}
          disabled={status === "running"}
          variant="outline"
          className="border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          {status === "running" ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : null}
          {status === "running" ? "Running…" : buttonLabel}
        </Button>
      </div>
    </div>
  )
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1"

type SourceSummary = {
  source: string
  fetched: number
  deduped: number
  discarded: number
  stored: number
}

type IngestionSummary = {
  sources: SourceSummary[]
  totalStored: number
}

async function runNewsIngestion(): Promise<string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null

  const res = await fetch(`${API_URL}/news-items/ingest`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.message ?? `Ingestion request failed (${res.status})`)
  }

  const summary = body.data as IngestionSummary
  return `${summary.totalStored} new items stored across ${summary.sources.length} sources`
}

export default function AdminPanel() {
  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Admin Controls"
        subtitle="Manually trigger backend operations for demo and testing purposes"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          icon={Zap}
          title="Run News Ingestion"
          description="Pulls the latest news from all configured sources (HackerNews, Dev.to, GitHub, Reddit, RSS) and runs the 4-layer filter pipeline."
          lastRun="2 hours ago"
          buttonLabel="Run"
          successMessage="Ingestion triggered successfully"
          onRun={runNewsIngestion}
        />
        <ActionCard
          icon={RefreshCw}
          title="Refresh Analytics"
          description="Fetches the latest 30-day performance data from Facebook, YouTube, and LinkedIn and rebuilds the cross-platform report."
          lastRun="6 hours ago"
          buttonLabel="Refresh"
          successMessage="Analytics refresh triggered successfully"
        />
      </div>
    </div>
  )
}
