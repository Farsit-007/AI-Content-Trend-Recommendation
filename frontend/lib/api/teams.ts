import { API_URL, TEAM_ID, authHeaders } from "./config"

export const DEFAULT_CATEGORIES = ["AI", "Web Dev", "Career", "Security", "DevOps", "Other"]

export async function fetchEffectiveCategories(): Promise<string[]> {
  if (!TEAM_ID) return DEFAULT_CATEGORIES

  const res = await fetch(`${API_URL}/teams/${TEAM_ID}/categories`, {
    headers: authHeaders(),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.message ?? `Failed to load categories (${res.status})`)
  }
  return body.data as string[]
}

export async function addCustomCategory(category: string): Promise<void> {
  const res = await fetch(`${API_URL}/teams/${TEAM_ID}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ category }),
  })
  if (!res.ok) {
    const body = await res.json()
    throw new Error(body?.message ?? `Failed to add category (${res.status})`)
  }
}

export async function removeCustomCategory(category: string): Promise<void> {
  const res = await fetch(`${API_URL}/teams/${TEAM_ID}/categories/${encodeURIComponent(category)}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.json()
    throw new Error(body?.message ?? `Failed to remove category (${res.status})`)
  }
}
