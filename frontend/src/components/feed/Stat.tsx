import type { LucideIcon } from 'lucide-react';

interface StatProps {
  icon: LucideIcon;
  value: number;
  label: string;
}

/**
 * A single engagement stat — rendered only when non-zero, so GitHub-only stars and HN-only
 * comments don't leave a row of meaningless "0"s on every other source's cards.
 *
 * Shared by NewsCard and NewsItemDialog. The two copies this replaces had already drifted
 * (`gap-1.5`/`size-4` in the card vs `gap-1`/`size-3.5` in the dialog); the dialog's tighter
 * pairing wins because it matches ScorePill, which sits directly beside it in both rows.
 */
export function Stat({ icon: Icon, value, label }: StatProps) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Icon className="size-3.5" aria-hidden="true" />
      {value}
      <span className="sr-only">{label}</span>
    </span>
  );
}
