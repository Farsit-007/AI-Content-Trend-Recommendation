import type { BestTime } from '@/lib/api/analytics';
import { cn } from '@/lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Show a coarse 4-hour grid to stay readable at 375px: 0,4,8,12,16,20.
const HOUR_BUCKETS = [0, 4, 8, 12, 16, 20];

export function BestTimesHeatmap({ bestTimes }: { bestTimes: BestTime[] }) {
  if (bestTimes.length === 0) {
    return <p className="text-muted-foreground text-sm">Not enough data to compute best times yet.</p>;
  }

  // Aggregate avg_reach into (day, hourBucket) cells and find the peak for intensity scaling.
  const cells = new Map<string, number>();
  let peak = 0;
  for (const bt of bestTimes) {
    const bucket = HOUR_BUCKETS.reduce((prev, h) => (bt.hour >= h ? h : prev), 0);
    const key = `${bt.day}-${bucket}`;
    const next = (cells.get(key) ?? 0) + bt.avg_reach;
    cells.set(key, next);
    peak = Math.max(peak, next);
  }

  const intensity = (v: number) => (peak === 0 ? 0 : v / peak);

  return (
    <div className="glass-card overflow-x-auto rounded-xl p-4">
      <div className="min-w-[320px]">
        <div className="grid grid-cols-[auto_repeat(6,1fr)] gap-1 text-[11px]">
          <div />
          {HOUR_BUCKETS.map((h) => (
            <div key={h} className="text-muted-foreground text-center">
              {String(h).padStart(2, '0')}
            </div>
          ))}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="contents">
              <div className="text-muted-foreground flex items-center pr-1">{day}</div>
              {HOUR_BUCKETS.map((h) => {
                const v = cells.get(`${dayIdx}-${h}`) ?? 0;
                const a = intensity(v);
                return (
                  <div
                    key={h}
                    title={`${day} ${h}:00 — avg reach ${Math.round(v)}`}
                    className={cn('aspect-square rounded-sm', a === 0 && 'bg-white/5')}
                    style={a > 0 ? { backgroundColor: `rgba(167, 139, 250, ${0.15 + a * 0.85})` } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
