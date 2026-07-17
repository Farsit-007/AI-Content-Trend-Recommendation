import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);
import { NewsDedupLedger } from '../app/modules/NewsDedupLedger/newsDedupLedger.model';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { NewsItemService } from '../app/modules/NewsItem/newsItem.service';
import { runIngestionPipeline } from '../app/modules/NewsIngestion/newsIngestion.service';

async function main() {
  await mongoose.connect(config.database_url as string);

  console.log('--- 4.2: resurrection test (delete a github_trending item, re-ingest, confirm no resurrection) ---');

  let target = await NewsItem.findOne({ source: 'github_trending' }).lean();
  if (!target) {
    console.log('No github_trending item stored yet — running ingestion once to seed one...');
    await runIngestionPipeline('manual');
    target = await NewsItem.findOne({ source: 'github_trending' }).lean();
  }
  if (!target) {
    console.log('[4.2] No github_trending item available even after ingestion — cannot run this check. SKIP');
  } else {
    console.log(`Target: "${target.title}" (${target.url}), content_hash=${target.content_hash}`);

    const deleted = await NewsItemService.deleteNewsItem(target._id.toString());
    console.log(`Deleted: ${deleted ? 'yes' : 'no'}`);

    const ledgerRow = await NewsDedupLedger.findOne({ content_hash: target.content_hash }).lean();
    console.log(`[4.2] Tombstone written before/at delete: ${ledgerRow ? 'PASS' : 'FAIL'}`);

    console.log('Running ingestion again (this may re-fetch the same trending repo if it is still trending)...');
    const summary = await runIngestionPipeline('manual');
    const ghSummary = summary.sources.find((s) => s.source === 'github_trending');
    console.log('github_trending run summary:', JSON.stringify(ghSummary));

    const resurrected = await NewsItem.findOne({ content_hash: target.content_hash }).lean();
    console.log(`[4.2] No live row exists with the deleted item's content_hash after re-ingestion (no resurrection): ${!resurrected ? 'PASS' : 'FAIL'}`);
  }

  console.log('\n--- 4.3: news_dedup_ledger TTL index ---');
  const indexes = await NewsDedupLedger.collection.indexes();
  const ttlIndex = indexes.find((idx) => idx.key && idx.key.deleted_at === 1 && typeof idx.expireAfterSeconds === 'number');
  console.log('Indexes on news_dedup_ledger:', JSON.stringify(indexes));
  console.log(`Configured NEWS_DEDUP_LEDGER_TTL_DAYS=${config.news_ingestion.dedup_ledger_ttl_days} (expireAfterSeconds should be ${config.news_ingestion.dedup_ledger_ttl_days * 86400})`);
  console.log(`[4.3] TTL index on deleted_at exists with matching expireAfterSeconds: ${ttlIndex?.expireAfterSeconds === config.news_ingestion.dedup_ledger_ttl_days * 86400 ? 'PASS' : 'FAIL'}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
