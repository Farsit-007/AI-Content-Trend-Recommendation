import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/lib/mock/chat"

type Props = { message: ChatMessage }

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary/15 text-foreground rounded-br-sm"
            : "glass-card text-muted-foreground rounded-bl-sm"
        )}
      >
        {message.content}
      </div>
    </div>
  )
}
