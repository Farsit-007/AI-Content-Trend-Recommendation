"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Sparkles, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import PageHeader from "@/components/shared/PageHeader"
import EmptyState from "@/components/shared/EmptyState"
import FormatPanel from "./FormatPanel"
import type { GeneratedContent } from "@/lib/mock/content"
import { useTeam } from "@/lib/team/TeamProvider"

const FORMAT_LABELS: { key: keyof Omit<GeneratedContent, "topic" | "youtube_idea">; label: string }[] = [
  { key: "facebook_post", label: "Facebook Post" },
  { key: "facebook_reel_script", label: "Reel Script" },
  { key: "linkedin_post", label: "LinkedIn" },
  { key: "caption", label: "Caption" },
]

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1"

async function generateContent(teamId: string, topic: string, newsItemId: string | null): Promise<GeneratedContent> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null

  const res = await fetch(`${API_URL}/content/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      team_id: teamId,
      topic,
      ...(newsItemId ? { news_item_id: newsItemId } : {}),
    }),
  })

  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.message ?? `Generation request failed (${res.status})`)
  }
  return body.data as GeneratedContent
}

export default function ContentGenerator() {
  const searchParams = useSearchParams()
  const { teamId } = useTeam()
  const [topic, setTopic] = useState(() => searchParams.get("topic") ?? "")
  const [isGenerating, setIsGenerating] = useState(false)
  const [content, setContent] = useState<GeneratedContent | null>(null)

  async function handleGenerate() {
    if (!topic.trim() || isGenerating) return
    setIsGenerating(true)
    setContent(null)
    try {
      const result = await generateContent(teamId, topic, searchParams.get("news_item_id"))
      setContent(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Content generation failed")
    } finally {
      setIsGenerating(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleGenerate()
  }

  const youtubeContent = content
    ? `${content.youtube_idea.title}\n\n🎣 Hook:\n${content.youtube_idea.hook}\n\n📋 Chapters:\n${content.youtube_idea.chapters.join("\n")}\n\n🖼 Thumbnail:\n${content.youtube_idea.thumbnail_concept}`
    : ""

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Generate Content"
        subtitle="Turn any trending topic into platform-ready content in seconds"
      />

      {/* Topic input */}
      <div className="flex gap-2 mb-8">
        <Input
          placeholder="Enter a topic or paste a news headline…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-background border-input focus:border-primary/50"
        />
        <Button
          onClick={handleGenerate}
          disabled={!topic.trim() || isGenerating}
          className="btn-glow bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
        >
          {isGenerating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {isGenerating ? "Generating…" : "Generate"}
        </Button>
      </div>

      {/* State: empty (no generation yet) */}
      {!isGenerating && !content && (
        <EmptyState
          icon={Sparkles}
          heading="Enter a topic above to generate content"
          subtext="Or click 'Generate content' on any news card in the Feed to pre-fill the topic."
        />
      )}

      {/* State: generating or content ready */}
      {(isGenerating || content) && (
        <Tabs defaultValue="all">
          <TabsList className="mb-4 bg-muted border border-border h-auto flex-wrap gap-1 p-1">
            {["all", "fb-post", "reel-script", "linkedin", "youtube-idea", "caption"].map((v) => (
              <TabsTrigger
                key={v}
                value={v}
                className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {v === "all" ? "All formats" :
                 v === "fb-post" ? "FB Post" :
                 v === "reel-script" ? "Reel Script" :
                 v === "linkedin" ? "LinkedIn" :
                 v === "youtube-idea" ? "YouTube Idea" : "Caption"}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-0">
            {FORMAT_LABELS.map(({ key, label }) => (
              <FormatPanel
                key={key}
                label={label}
                content={content?.[key] ?? ""}
                isLoading={isGenerating}
              />
            ))}
            <FormatPanel
              label="YouTube Idea"
              content={youtubeContent}
              isLoading={isGenerating}
            />
          </TabsContent>

          <TabsContent value="fb-post" className="mt-0">
            <FormatPanel label="Facebook Post" content={content?.facebook_post ?? ""} isLoading={isGenerating} />
          </TabsContent>
          <TabsContent value="reel-script" className="mt-0">
            <FormatPanel label="Reel Script" content={content?.facebook_reel_script ?? ""} isLoading={isGenerating} />
          </TabsContent>
          <TabsContent value="linkedin" className="mt-0">
            <FormatPanel label="LinkedIn Post" content={content?.linkedin_post ?? ""} isLoading={isGenerating} />
          </TabsContent>
          <TabsContent value="youtube-idea" className="mt-0">
            <FormatPanel label="YouTube Idea" content={youtubeContent} isLoading={isGenerating} />
          </TabsContent>
          <TabsContent value="caption" className="mt-0">
            <FormatPanel label="Caption" content={content?.caption ?? ""} isLoading={isGenerating} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
