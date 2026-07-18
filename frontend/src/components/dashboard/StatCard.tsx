import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ACCENTS = {
  violet: 'bg-violet-400/10 text-violet-300',
  amber: 'bg-amber-400/10 text-amber-400',
  emerald: 'bg-emerald-400/10 text-emerald-400',
  sky: 'bg-sky-400/10 text-sky-300',
  rose: 'bg-rose-400/10 text-rose-300',
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
    <div className="glass-card flex flex-col gap-3 rounded-xl p-4 transition hover:border-white/20">
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
