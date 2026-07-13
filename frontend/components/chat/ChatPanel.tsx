"use client"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import PageHeader from "@/components/shared/PageHeader"
import MessageBubble from "./MessageBubble"
import TypingIndicator from "./TypingIndicator"
import { INITIAL_MESSAGE, findResponse, type ChatMessage } from "@/lib/mock/chat"

const STARTER_PROMPTS = [
  "এই সপ্তাহে AI নিয়ে কোন news আছে?",
  "আমাদের Facebook এ কোন post সবচেয়ে ভালো?",
  "React 19 নিয়ে YouTube video করা উচিত?",
]

function makeId() {
  return Math.random().toString(36).slice(2)
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  function sendMessage(text: string) {
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

    setTimeout(() => {
      const reply: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: findResponse(trimmed),
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, reply])
      setIsTyping(false)
    }, 1800)
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
