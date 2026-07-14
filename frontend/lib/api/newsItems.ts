import type { NewsItem } from "@/lib/mock/news"
import { API_URL, authHeaders } from "./config"
import { getActiveTeamId } from "@/lib/team/TeamProvider"

const HOT_THRESHOLD = 7
const OPPORTUNITY_THRESHOLD = 7

type RemoteNewsItem = {
  _id: string
  title: string
  source: string
  url: string
  snippet?: string
  category?: string
  published_at?: string
  trend_score: number
  opportunity_score?: number
  relevance_score?: number
  impact_note?: string
  needs_review?: boolean
  is_overridden?: boolean
}

function toNewsItem(remote: RemoteNewsItem): NewsItem {
  const opportunity_score = remote.opportunity_score ?? 0
  return {
    id: remote._id,
    title: remote.title,
    source: remote.source,
    url: remote.url,
    snippet: remote.snippet ?? "",
    category: remote.category ?? "Other",
    published_at: remote.published_at ?? new Date().toISOString(),
    trend_score: remote.trend_score,
    opportunity_score,
    relevance_score: remote.relevance_score ?? 0,
    is_hot: remote.trend_score >= HOT_THRESHOLD,
    is_opportunity: opportunity_score >= OPPORTUNITY_THRESHOLD,
    impact_note: remote.impact_note ?? "",
    needs_review: remote.needs_review ?? false,
    is_overridden: remote.is_overridden ?? false,
  }
}

export async function fetchNewsItems(): Promise<NewsItem[]> {
  const res = await fetch(`${API_URL}/news-items`, {
    headers: authHeaders(),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.message ?? `Failed to load news items (${res.status})`)
  }
  return (body.data as RemoteNewsItem[]).map(toNewsItem)
}

export async function setNewsItemOverride(
  newsItemId: string,
  changes: { category?: string; opportunity_score?: number },
): Promise<void> {
  const res = await fetch(`${API_URL}/news-items/${newsItemId}/override`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ team_id: getActiveTeamId(), ...changes }),
  })
  if (!res.ok) {
    const body = await res.json()
    throw new Error(body?.message ?? `Failed to save override (${res.status})`)
  }
}

export async function clearNewsItemOverride(newsItemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/news-items/${newsItemId}/override`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ team_id: getActiveTeamId() }),
  })
  if (!res.ok) {
    const body = await res.json()
    throw new Error(body?.message ?? `Failed to clear override (${res.status})`)
  }
}
