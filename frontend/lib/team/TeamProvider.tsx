"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { fetchCurrentUser, fetchTeams, type Team } from "@/lib/api/auth"
import { getAuthToken } from "@/lib/api/config"

const DEFAULT_TEAM_ID = process.env.NEXT_PUBLIC_DEFAULT_TEAM_ID ?? ""
const STORAGE_KEY = "active_team_id"

// Mirrors the resolved team id so non-component API helpers (lib/api/*.ts) can
// read it synchronously, the same way getAuthToken() reads localStorage directly.
let activeTeamId = DEFAULT_TEAM_ID

export function getActiveTeamId(): string {
  return activeTeamId
}

function persist(id: string) {
  activeTeamId = id
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, id)
  }
}

type TeamContextValue = {
  teamId: string
  teams: Team[]
  setTeamId: (id: string) => void
  isLoading: boolean
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamIdInternal] = useState(DEFAULT_TEAM_ID)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      // No token means no login flow in this build — keep using the env fallback
      // rather than calling an endpoint that will 401.
      if (!getAuthToken()) {
        setIsLoading(false)
        return
      }

      try {
        const [{ team_ids }, allTeams] = await Promise.all([fetchCurrentUser(), fetchTeams()])
        if (cancelled) return

        const myTeams = allTeams.filter((t) => team_ids.includes(t.id))
        setTeams(myTeams)
        if (myTeams.length === 0) return

        const stored = window.localStorage.getItem(STORAGE_KEY)
        const resolved = stored && myTeams.some((t) => t.id === stored) ? stored : myTeams[0].id
        setTeamIdInternal(resolved)
        persist(resolved)
      } catch (err) {
        console.error("Failed to resolve active team; falling back to default team id", err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    resolve()
    return () => {
      cancelled = true
    }
  }, [])

  const setTeamId = useCallback((id: string) => {
    setTeamIdInternal(id)
    persist(id)
  }, [])

  const value = useMemo(
    () => ({ teamId, teams, setTeamId, isLoading }),
    [teamId, teams, setTeamId, isLoading]
  )

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
}

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext)
  if (!ctx) {
    throw new Error("useTeam must be used within a TeamProvider")
  }
  return ctx
}
