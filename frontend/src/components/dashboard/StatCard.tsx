import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/* The 300/400 weights only clear contrast against a dark surface — on the light theme's white
   card they wash out, so each accent pairs a darker light-mode ink with the original dark one. */
const ACCENTS = {
  violet: 'bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400',
  sky: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300',
  rose: 'bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300',
} as const;

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  accent?: keyof typeof ACCENTS;
  to?: string;
}

/** A single KPI tile — the Overview page's core visual unit, for both team-scoped and
 *  system-wide numbers. Optionally links somewhere relevant (e.g. drafts count -> Drafts). */
export function StatCard({ icon: Icon, label, value, hint, accent = 'violet', to }: StatCardProps) {
  const content = (
    <div className="glass-card flex flex-col gap-3 rounded-xl p-4 transition hover:border-violet-500/40 dark:hover:border-white/20">
      <div className="flex items-center justify-between">
        <div className={cn('flex size-9 items-center justify-center rounded-lg', ACCENTS[accent])}>
          <Icon className="size-4.5" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground/70">{hint}</p>}
      </div>
    </div>
  );

  return to ? (
    <Link to={to} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}
