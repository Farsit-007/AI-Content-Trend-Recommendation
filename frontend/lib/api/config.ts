export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1"

// TODO: replace with a real team-selector once the frontend has an auth/team context
// (see components/generate/ContentGenerator.tsx for the same placeholder).
export const TEAM_ID = process.env.NEXT_PUBLIC_DEFAULT_TEAM_ID ?? ""

export function getAuthToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("auth_token") : null
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
