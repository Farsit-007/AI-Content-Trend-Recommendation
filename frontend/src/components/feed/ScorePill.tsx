import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScorePillProps {
  icon: LucideIcon;
  label: string;
  /** Score on a 0-10 scale; clamped before display. */
  value: number;
  variant: 'trend' | 'opportunity';
}

const VARIANT_TEXT: Record<ScorePillProps['variant'], string> = {
  trend: 'text-trend',
  opportunity: 'text-opportunity',
};

/**
 * Compact 0-10 score pill for a metadata line. Shared by NewsCard and NewsItemDialog — it was
 * previously copy-pasted into both, which is how the two `Stat` siblings drifted apart.
 *
 * No `title` tooltip: NewsCard's metadata row is `pointer-events-none` so clicks reach the card's
 * overlay button, which also means a native tooltip could never fire. The sr-only text is what
 * carries the meaning for assistive tech.
 */
export function ScorePill({ icon: Icon, label, value, variant }: ScorePillProps) {
  const clamped = Math.max(0, Math.min(10, value));
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold tabular-nums', VARIANT_TEXT[variant])}>
      <Icon className="size-3.5" aria-hidden="true" />
      {clamped.toFixed(1)}
      <span className="sr-only">{label} score out of 10</span>
    </span>
  );
}
