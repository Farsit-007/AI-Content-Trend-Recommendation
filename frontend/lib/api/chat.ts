import { API_URL, authHeaders } from "./config"

export async function sendChatMessage(
  teamId: string,
  message: string,
  conversationId: string | null,
): Promise<{ conversation_id: string; reply: string }> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      team_id: teamId,
      message,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.message ?? `Chat request failed (${res.status})`)
  }
  return body.data as { conversation_id: string; reply: string }
}
