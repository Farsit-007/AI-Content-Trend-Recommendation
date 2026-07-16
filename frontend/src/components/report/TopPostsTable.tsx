import type { TopPost } from '@/lib/api/analytics';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function FormatChip({ format }: { format?: string }) {
  if (!format) return null;
  return (
    <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[11px] text-violet-300 capitalize">
      {format}
    </span>
  );
}

export function TopPostsTable({ posts }: { posts: TopPost[] }) {
  if (posts.length === 0) {
    return <p className="text-muted-foreground text-sm">No posts in the last 30 days.</p>;
  }

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      {/* Desktop: table. Mobile (<640px): stacked cards. */}
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="text-muted-foreground border-white/10 border-b text-left text-xs">
            <th className="px-4 py-3 font-medium">Post</th>
            <th className="px-4 py-3 font-medium">Format</th>
            <th className="px-4 py-3 text-right font-medium">Reach</th>
            <th className="px-4 py-3 text-right font-medium">Engagement</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.post_id} className="border-white/5 border-b last:border-0">
              <td className="max-w-xs truncate px-4 py-3">{p.content_snippet ?? p.post_id}</td>
              <td className="px-4 py-3">
                <FormatChip format={p.format} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{compact.format(p.reach)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-amber-300">{compact.format(p.engagement)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col divide-y divide-white/5 sm:hidden">
        {posts.map((p) => (
          <li key={p.post_id} className="flex flex-col gap-2 p-4">
            <p className="line-clamp-2 text-sm">{p.content_snippet ?? p.post_id}</p>
            <div className="flex items-center justify-between">
              <FormatChip format={p.format} />
              <div className="text-muted-foreground flex gap-4 text-xs tabular-nums">
                <span>Reach {compact.format(p.reach)}</span>
                <span className="text-amber-300">Eng {compact.format(p.engagement)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
