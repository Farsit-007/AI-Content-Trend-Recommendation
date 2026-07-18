import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import mongoose from 'mongoose';
import config from '../app/config';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';

const SAMPLE_LIMIT = 20;
type ContentStatus = 'none' | 'partial' | 'full' | 'failed';

interface StatusCounts {
  none: number;
  partial: number;
  full: number;
  failed: number;
  total: number;
}

async function main() {
  await mongoose.connect(config.database_url as string);

  const grouped = await NewsItem.aggregate<{
    _id: { source: string; content_status: string };
    count: number;
    avgWordCount: number | null;
  }>([
    {
      $group: {
        // A raw aggregation reads the stored document directly, bypassing the mongoose schema
        // default — a document with no content_status field on disk (e.g. ingested before this
        // field existed) groups under `null`, not `'none'`, unless coalesced explicitly here.
        _id: { source: '$source', content_status: { $ifNull: ['$content_status', 'none'] } },
        count: { $sum: 1 },
        avgWordCount: { $avg: '$word_count' },
      },
    },
  ]);

  const bySource = new Map<string, StatusCounts>();
  const avgWordCountBySource = new Map<string, { sum: number; weight: number }>();

  for (const row of grouped) {
    const source = row._id.source;
    const status = row._id.content_status as ContentStatus;

    const counts = bySource.get(source) ?? { none: 0, partial: 0, full: 0, failed: 0, total: 0 };
    counts[status] = (counts[status] ?? 0) + row.count;
    counts.total += row.count;
    bySource.set(source, counts);

    if (row.avgWordCount !== null && row.avgWordCount !== undefined) {
      const acc = avgWordCountBySource.get(source) ?? { sum: 0, weight: 0 };
      acc.sum += row.avgWordCount * row.count;
      acc.weight += row.count;
      avgWordCountBySource.set(source, acc);
    }
  }

  const table = [...bySource.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([source, counts]) => {
      const pct = (n: number) => (counts.total > 0 ? `${((n / counts.total) * 100).toFixed(1)}%` : '0.0%');
      const avgAcc = avgWordCountBySource.get(source);
      return {
        source,
        total: counts.total,
        none: `${counts.none} (${pct(counts.none)})`,
        partial: `${counts.partial} (${pct(counts.partial)})`,
        full: `${counts.full} (${pct(counts.full)})`,
        failed: `${counts.failed} (${pct(counts.failed)})`,
        'avg word_count (where present)': avgAcc ? Math.round(avgAcc.sum / avgAcc.weight) : '—',
      };
    });

  console.log(`\n=== Content coverage by source (${bySource.size} sources, ${grouped.reduce((n, r) => n + r.count, 0)} documents) ===\n`);
  console.table(table);

  const sample = await NewsItem.find(
    { $or: [{ content_status: { $in: ['none', 'failed'] } }, { content_status: { $exists: false } }] },
    { title: 1, url: 1, source: 1, content_status: 1 },
  )
    .limit(SAMPLE_LIMIT)
    .lean();

  console.log(`\n=== Sample of up to ${SAMPLE_LIMIT} none/failed items for manual spot-checking ===\n`);
  if (sample.length === 0) {
    console.log('(none — every document has content_status partial or full)');
  } else {
    for (const item of sample) {
      console.log(`[${item.content_status ?? 'none'}] [${item.source}] ${item.title}\n  ${item.url}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
