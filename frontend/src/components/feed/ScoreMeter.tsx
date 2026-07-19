import { cn } from '@/lib/utils';

interface ScoreMeterProps {
  label: string;
  /** Score on a 0-10 scale. */
  value: number;
  variant: 'amber' | 'emerald';
}

const VARIANT_FILL: Record<ScoreMeterProps['variant'], string> = {
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
};

const VARIANT_TEXT: Record<ScoreMeterProps['variant'], string> = {
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
};

/** A tiny inline 0-10 meter — track + colored fill + numeric value. No chart library needed. */
export function ScoreMeter({ label, value, variant }: ScoreMeterProps) {
  const clamped = Math.max(0, Math.min(10, value));
  const percent = (clamped / 10) * 100;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="h-1.5 w-full min-w-0 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={cn('h-full rounded-full', VARIANT_FILL[variant])}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={cn('w-8 shrink-0 text-right font-medium', VARIANT_TEXT[variant])}>
        {clamped.toFixed(1)}
      </span>
    </div>
  );
}
