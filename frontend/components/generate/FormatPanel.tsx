"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

type Props = {
  label: string
  content: string
  isLoading: boolean
}

export default function FormatPanel({ label, content, isLoading }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    toast.success("Copied!")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass-card rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {!isLoading && content && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            onClick={handleCopy}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {content}
        </p>
      )}
    </div>
  )
}
