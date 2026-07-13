"use client"

import { ArrowUpDown } from "lucide-react"
import { SORT_OPTIONS, type SortOption } from "./constants"

type Props = {
  value: SortOption
  onSort: (sort: SortOption) => void
}

export default function SortSelect({ value, onSort }: Props) {
  return (
    <div className="relative flex items-center gap-1.5">
      <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
      <select
        value={value}
        onChange={(e) => onSort(e.target.value as SortOption)}
        className="appearance-none bg-transparent text-sm text-muted-foreground hover:text-foreground cursor-pointer outline-none pr-1 transition-colors"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt} value={opt} className="bg-background text-foreground">
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
