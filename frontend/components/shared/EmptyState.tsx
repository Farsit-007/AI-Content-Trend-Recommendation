import type { LucideIcon } from "lucide-react"

type Props = {
  icon: LucideIcon
  heading: string
  subtext?: string
}

export default function EmptyState({ icon: Icon, heading, subtext }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
      <div className="p-4 rounded-full bg-muted border border-border">
        <Icon className="size-8 text-muted-foreground opacity-40" />
      </div>
      <p className="font-semibold text-muted-foreground">{heading}</p>
      {subtext && <p className="text-sm text-muted-foreground/60 max-w-xs">{subtext}</p>}
    </div>
  )
}
