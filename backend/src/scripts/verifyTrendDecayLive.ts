// Shrink the decay constant for this run only, so decay is visible within a few seconds of
// wall-clock time instead of requiring hours — set before any other import touches config.
process.env.NEWS_TREND_DECAY_TAU_HOURS = '0.01'; // ~36s half-life-ish window

import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);
import { redis } from '../app/lib/redis';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { NewsItemService } from '../app/modules/NewsItem/newsItem.service';
import { runEngagementRefresh } from '../app/modules/NewsRefresh/newsRefresh.service';

// Strict-decrease-across-two-cycles is proven deterministically (fake timers, no external API
// flakiness) by newsRefresh.integration.test.ts — this live script instead checks the two things
// only a real Atlas run + the real service layer can confirm: backfill against real data, and the
// feed's default-sort plumbing actually reading current_trend_score end to end.

async function main() {
  await mongoose.connect(config.database_url as string);
  console.log(`Using NEWS_TREND_DECAY_TAU_HOURS=${config.news_ingestion.trend_decay.tau_hours} (shrunk for this verification run)\n`);

  console.log('--- 4.3: backfill for a pre-existing (unscored) row ---');
  const anyItem = await NewsItem.findOne({}).lean();
  if (!anyItem) throw new Error('No news items in DB — run ingestion first (npm run verify:engagement-refresh-live)');
  await NewsItem.updateOne({ _id: anyItem._id }, { $unset: { current_trend_score: 1 } });
  const beforeBackfill = await NewsItem.findById(anyItem._id).lean();
  console.log(`Cleared current_trend_score on item ${anyItem._id} — now: ${beforeBackfill?.current_trend_score}`);

  await redis.del('lock:news_refresh'); // in case a prior run's lock is still held
  await runEngagementRefresh();

  const afterBackfill = await NewsItem.findById(anyItem._id).lean();
  const backfilled = afterBackfill?.current_trend_score !== undefined && afterBackfill?.current_trend_score !== null;
  console.log(`After one refresh run: current_trend_score = ${afterBackfill?.current_trend_score}`);
  console.log(`[4.3] Pre-existing unscored row got backfilled: ${backfilled ? 'PASS' : 'FAIL'}`);

  console.log('\n--- 4.2: feed default sort uses current_trend_score, explicit sort unchanged ---');
  const { result: defaultSorted } = await NewsItemService.getAllNewsItems({ limit: '10' });
  const scores = defaultSorted.map((item) => (item as { current_trend_score?: number; trend_score: number }).current_trend_score
    ?? (item as { trend_score: number }).trend_score);
  const isDescending = scores.every((s, i) => i === 0 || (scores[i - 1] as number) >= (s as number));
  console.log('Default-sort (no ?sort) page 1 scores:', scores);
  console.log(`[4.2] Default-sort page 1 is ordered by current_trend_score descending: ${isDescending ? 'PASS' : 'FAIL'}`);

  const { result: explicitSorted } = await NewsItemService.getAllNewsItems({ sort: '-created_at', limit: '10' });
  const createdDates = explicitSorted.map((item) => (item as { created_at: Date }).created_at.getTime());
  const isCreatedDescending = createdDates.every((d, i) => i === 0 || createdDates[i - 1] >= d);
  console.log(`[4.2] Explicit ?sort=-created_at still honored (created_at descending): ${isCreatedDescending ? 'PASS' : 'FAIL'}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
