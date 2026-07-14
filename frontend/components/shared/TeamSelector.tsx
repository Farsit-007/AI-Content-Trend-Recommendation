"use client"

import { Building2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTeam } from "@/lib/team/TeamProvider"

export default function TeamSelector() {
  const { teamId, teams, setTeamId, isLoading } = useTeam()

  if (isLoading || teams.length === 0) return null

  if (teams.length === 1) {
    return (
      <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Building2 className="size-3.5 shrink-0" />
        <span className="hidden sm:inline truncate max-w-32">{teams[0].name}</span>
      </div>
    )
  }

  return (
    <Select value={teamId} onValueChange={setTeamId}>
      <SelectTrigger size="sm" className="text-xs" aria-label="Select team">
        <Building2 className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {teams.map((team) => (
          <SelectItem key={team.id} value={team.id}>
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
