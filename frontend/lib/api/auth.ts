import { API_URL, authHeaders } from "./config"

export type CurrentUser = {
  id: string
  email: string
  name: string
  role: "super_admin" | "admin" | "user"
}

export type Team = {
  id: string
  name: string
}

type RemoteUser = {
  _id: string
  email: string
  name: string
  role: "super_admin" | "admin" | "user"
}

type RemoteTeam = {
  _id: string
  name: string
}

export async function fetchCurrentUser(): Promise<{ user: CurrentUser; team_ids: string[] }> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: authHeaders(),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.message ?? `Failed to load current user (${res.status})`)
  }
  const data = body.data as { user: RemoteUser; team_ids: string[] }
  const { _id, ...rest } = data.user
  return { user: { id: _id, ...rest }, team_ids: data.team_ids }
}

export async function fetchTeams(): Promise<Team[]> {
  const res = await fetch(`${API_URL}/teams`, {
    headers: authHeaders(),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.message ?? `Failed to load teams (${res.status})`)
  }
  return (body.data as RemoteTeam[]).map(({ _id, name }) => ({ id: _id, name }))
}
