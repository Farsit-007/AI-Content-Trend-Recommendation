export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1"

export function getAuthToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("auth_token") : null
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
