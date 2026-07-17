import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);
import { runIngestionPipeline } from '../app/modules/NewsIngestion/newsIngestion.service';
import { runEngagementRefresh } from '../app/modules/NewsRefresh/newsRefresh.service';
import { REFRESHABLE_SOURCES } from '../app/modules/NewsRefresh/newsRefresh.fetchers';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { MaintenanceRun } from '../app/modules/MaintenanceRun/maintenanceRun.model';

async function main() {
  await mongoose.connect(config.database_url as string);

  console.log('--- 6.2: manual ingest, then engagement refresh ---');
  console.log(`Refreshable sources: ${REFRESHABLE_SOURCES.join(', ')}`);

  console.log('\nRunning manual ingestion...');
  const ingestSummary = await runIngestionPipeline('manual');
  console.log('Ingestion summary:', JSON.stringify(ingestSummary));

  console.log('\nRunning engagement refresh...');
  await runEngagementRefresh();

  const refreshed = await NewsItem.find({
    source: { $in: REFRESHABLE_SOURCES },
    engagement_refreshed_at: { $ne: null },
  })
    .sort({ engagement_refreshed_at: -1 })
    .limit(10)
    .select('source source_id engagement engagement_history engagement_refreshed_at source_removed')
    .lean();

  console.log(`\nItems with engagement_refreshed_at set: ${refreshed.length}`);
  for (const item of refreshed) {
    console.log(
      `  - [${item.source}] ${item.source_id}: history=${item.engagement_history?.length ?? 0} snapshots, ` +
        `refreshed_at=${item.engagement_refreshed_at?.toISOString()}, source_removed=${item.source_removed}`,
    );
  }
  const hasTwoPlusSnapshots = refreshed.some((item) => (item.engagement_history?.length ?? 0) >= 2);
  console.log(`[6.2] At least one refreshed item has >=2 history snapshots: ${hasTwoPlusSnapshots ? 'PASS' : 'FAIL'}`);
  console.log(`[6.2] At least one item shows engagement_refreshed_at: ${refreshed.length > 0 ? 'PASS' : 'FAIL'}`);

  console.log('\n--- 6.3: maintenance_runs doc + TTL index ---');
  const latestRun = await MaintenanceRun.findOne({ job: 'engagement_refresh' }).sort({ started_at: -1 }).lean();
  console.log('Latest engagement_refresh run doc:', JSON.stringify(latestRun, null, 2));

  const indexes = await MaintenanceRun.collection.indexes();
  const ttlIndex = indexes.find((idx) => idx.key && idx.key.started_at === 1 && typeof idx.expireAfterSeconds === 'number');
  console.log('\nIndexes on maintenance_runs:', JSON.stringify(indexes));
  console.log(`[6.3] maintenance_runs document persisted: ${latestRun ? 'PASS' : 'FAIL'}`);
  console.log(`[6.3] TTL index on started_at (expireAfterSeconds=2592000) exists: ${ttlIndex ? 'PASS' : 'FAIL'}`);

  await mongoose.disconnect();
  const ok = hasTwoPlusSnapshots && refreshed.length > 0 && !!latestRun && !!ttlIndex;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
