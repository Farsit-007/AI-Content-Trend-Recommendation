import { Sparkles } from "lucide-react"

type Props = { insight: string }

export default function AIInsightBlock({ insight }: Props) {
  return (
    <div className="glass-card rounded-lg p-5 border-l-2 border-primary mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">AI Cross-Platform Insight</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{insight}</p>
    </div>
  )
}
