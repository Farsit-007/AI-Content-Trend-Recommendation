import { Eye, Users, Heart, TrendingUp } from 'lucide-react';
import type { AnalyticsOverview } from '@/lib/api/analytics';
import { cn } from '@/lib/utils';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

interface StatDef {
  label: string;
  value: string;
  icon: typeof Eye;
  accent: string;
}

export function StatCards({ overview }: { overview: AnalyticsOverview }) {
  const stats: StatDef[] = [
    { label: 'Reach', value: compact.format(overview.reach), icon: Users, accent: 'text-violet-400' },
    { label: 'Views', value: compact.format(overview.views), icon: Eye, accent: 'text-cyan-400' },
    { label: 'Engagements', value: compact.format(overview.engagements), icon: Heart, accent: 'text-amber-400' },
    {
      label: 'Engagement Rate',
      value: `${(overview.engagement_rate * 100).toFixed(1)}%`,
      icon: TrendingUp,
      accent: 'text-emerald-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="glass-card flex flex-col gap-2 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">{s.label}</span>
            <s.icon className={cn('size-4', s.accent)} />
          </div>
          <span className="text-2xl font-semibold tracking-tight">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
