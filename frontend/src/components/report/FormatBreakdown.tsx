import type { ContentBreakdown } from '@/lib/api/analytics';

export function FormatBreakdown({ breakdown }: { breakdown: ContentBreakdown[] }) {
  if (breakdown.length === 0) {
    return <p className="text-muted-foreground text-sm">No format breakdown available.</p>;
  }

  const peak = Math.max(...breakdown.map((b) => b.avg_engagement_rate), 0.0001);

  return (
    <div className="glass-card flex flex-col gap-3 rounded-xl p-4">
      {breakdown.map((b) => (
        <div key={b.format} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="capitalize">{b.format}</span>
            <span className="text-emerald-400 tabular-nums">{(b.avg_engagement_rate * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400"
              style={{ width: `${Math.max(4, (b.avg_engagement_rate / peak) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
