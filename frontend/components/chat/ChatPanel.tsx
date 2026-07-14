"use client"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import PageHeader from "@/components/shared/PageHeader"
import MessageBubble from "./MessageBubble"
import TypingIndicator from "./TypingIndicator"
import { sendChatMessage } from "@/lib/api/chat"
import { useTeam } from "@/lib/team/TeamProvider"

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
}

const INITIAL_MESSAGE: ChatMessage = {
  id: "init",
  role: "assistant",
  content: `আসসালামু আলাইকুম! আমি Growth Studio-র AI assistant। 👋

আমি তোমাকে help করতে পারবো:
• এই সপ্তাহের trending tech news নিয়ে
• তোমার Facebook, YouTube, LinkedIn performance নিয়ে
• কোন content এখন বানানো উচিত সেই decision নিয়ে

তুমি Banglish বা English যেকোনো ভাষায় জিজ্ঞেস করতে পারো। কী জানতে চাও?`,
  timestamp: new Date().toISOString(),
}

const STARTER_PROMPTS = [
  "এই সপ্তাহে AI নিয়ে কোন news আছে?",
  "আমাদের Facebook এ কোন post সবচেয়ে ভালো?",
  "React 19 নিয়ে YouTube video করা উচিত?",
]

function makeId() {
  return Math.random().toString(36).slice(2)
}

export default function ChatPanel() {
  const { teamId } = useTeam()
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const conversationIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isTyping) return

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    try {
      const { conversation_id, reply } = await sendChatMessage(teamId, trimmed, conversationIdRef.current)
      conversationIdRef.current = conversation_id
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content: reply, timestamp: new Date().toISOString() },
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat request failed")
    } finally {
      setIsTyping(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto">
      <PageHeader
        title="Ask Growth Studio"
        subtitle="Ask about trending topics, your channel performance, or what to create next"
      />

      {/* Starter prompts */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="text-xs px-3 py-1.5 rounded-full glass-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Message thread */}
      <ScrollArea className="flex-1 pr-2 mb-4">
        <div className="space-y-4 pb-2">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input bar */}
      <div className="flex gap-2 border-t border-border pt-4">
        <Input
          placeholder="Ask about trends, your analytics, or what to create next…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isTyping}
          className="bg-background border-input focus:border-primary/50"
        />
        <Button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isTyping}
          className="btn-glow bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}
