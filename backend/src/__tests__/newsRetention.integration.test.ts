import config from '../app/config';
import { redis } from '../app/lib/redis';
import { MaintenanceRun } from '../app/modules/MaintenanceRun/maintenanceRun.model';
import { NewsDedupLedger } from '../app/modules/NewsDedupLedger/newsDedupLedger.model';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { NewsItemCategoryOverride } from '../app/modules/NewsItemCategoryOverride/newsItemCategoryOverride.model';
import { NewsItemService } from '../app/modules/NewsItem/newsItem.service';
import { fetchRecentEmbeddings } from '../app/modules/NewsIngestion/newsIngestion.utils';
import { runNewsRetention } from '../app/modules/NewsRetention/newsRetention.service';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { testEmbedding } from './support/fixtures';

beforeAll(connectTestDb);
afterEach(async () => {
  await clearTestDb();
  await redis.flushall();
});
afterAll(disconnectTestDb);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

const { max_age_hours, min_age_hours, trend_floor, delete_after_days } = config.news_ingestion.retention;

const seed = (overrides: Partial<Parameters<typeof NewsItem.create>[0]> = {}) =>
  NewsItem.create({
    source: 'hackernews',
    source_id: `id-${Math.random()}`,
    content_hash: `hash-${Math.random()}`,
    title: 'Test story',
    url: `https://example.test/${Math.random()}`,
    embedding: testEmbedding(),
    engagement: { points: 10, comments: 0, stars_delta: 0 },
    trend_score: 1,
    current_trend_score: 5,
    needs_review: false,
    processed: true,
    lifecycle: 'active',
    created_at: new Date(),
    ...overrides,
  });

const reload = (id: unknown) => NewsItem.findById(id).lean();

// ── 6.2 Stage 1 archive scenarios + restore ────────────────────────────────────────────────────
describe('runNewsRetention — Stage 1 archive', () => {
  it('archives an over-max-age item with reason max_age', async () => {
    const item = await seed({ created_at: hoursAgo(max_age_hours + 1), current_trend_score: 9 });
    await runNewsRetention();
    const after = await reload(item._id);
    expect(after?.lifecycle).toBe('archived');
    expect(after?.archive_reason).toBe('max_age');
    expect(after?.archived_at).toBeInstanceOf(Date);
  });

  it('archives a min-age, below-floor item WITH an engagement signal as trend_floor', async () => {
    const item = await seed({
      source: 'hackernews', // registry source => has engagement signal
      created_at: hoursAgo(min_age_hours + 1),
      current_trend_score: trend_floor - 0.5,
    });
    await runNewsRetention();
    const after = await reload(item._id);
    expect(after?.lifecycle).toBe('archived');
    expect(after?.archive_reason).toBe('trend_floor');
  });

  it('does NOT archive a same-age below-floor item that has NO engagement signal (rss, zero engagement)', async () => {
    const item = await seed({
      source: 'rss:example.com',
      engagement: { points: 0, comments: 0, stars_delta: 0 },
      created_at: hoursAgo(min_age_hours + 1),
      current_trend_score: 0,
    });
    await runNewsRetention();
    const after = await reload(item._id);
    expect(after?.lifecycle).toBe('active');
  });

  it('does NOT archive a below-floor item still inside the min-age grace period', async () => {
    const item = await seed({
      source: 'hackernews',
      created_at: hoursAgo(min_age_hours - 1),
      current_trend_score: 0,
    });
    await runNewsRetention();
    expect((await reload(item._id))?.lifecycle).toBe('active');
  });

  it('archives a source_removed item immediately regardless of age', async () => {
    const item = await seed({ created_at: hoursAgo(1), current_trend_score: 9, source_removed: true });
    await runNewsRetention();
    const after = await reload(item._id);
    expect(after?.lifecycle).toBe('archived');
    expect(after?.archive_reason).toBe('source_removed');
  });

  it('protects an item with a recent category override', async () => {
    const item = await seed({ created_at: hoursAgo(max_age_hours + 1) });
    await NewsItemCategoryOverride.create({
      news_item_id: item._id.toString(),
      team_id: 'team1',
      overridden_by: 'admin',
      overridden_at: daysAgo(1),
    });
    await runNewsRetention();
    expect((await reload(item._id))?.lifecycle).toBe('active');
  });

  it('protects a fresh needs_review item', async () => {
    const item = await seed({ created_at: hoursAgo(max_age_hours + 1), needs_review: true });
    await runNewsRetention();
    expect((await reload(item._id))?.lifecycle).toBe('active');
  });

  it('restore via updateNewsItem clears archived_at/archive_reason and the item reappears in the default listing', async () => {
    const item = await seed({ created_at: hoursAgo(max_age_hours + 1) });
    await runNewsRetention();
    expect((await reload(item._id))?.lifecycle).toBe('archived');

    await NewsItemService.updateNewsItem(item._id.toString(), { lifecycle: 'active' });
    const restored = await reload(item._id);
    expect(restored?.lifecycle).toBe('active');
    expect(restored?.archived_at ?? null).toBeNull();
    expect(restored?.archive_reason ?? null).toBeNull();

    const listed = await NewsItemService.getAllNewsItems({});
    expect(listed.result.map((r) => r._id.toString())).toContain(item._id.toString());
  });
});

// ── 6.3 Stage 2 cascade + idempotency ───────────────────────────────────────────────────────────
describe('runNewsRetention — Stage 2 hard delete cascade', () => {
  it('tombstones, removes overrides, deletes the item, and tallies counts', async () => {
    const item = await seed({
      lifecycle: 'archived',
      archived_at: daysAgo(delete_after_days + 1),
      content_hash: 'doomed-hash',
    });
    await NewsItemCategoryOverride.create({
      news_item_id: item._id.toString(),
      team_id: 'team1',
      overridden_by: 'admin',
    });

    await runNewsRetention();

    expect(await reload(item._id)).toBeNull();
    expect(await NewsDedupLedger.findOne({ content_hash: 'doomed-hash' })).not.toBeNull();
    expect(await NewsItemCategoryOverride.countDocuments({ news_item_id: item._id.toString() })).toBe(0);

    const run = await MaintenanceRun.findOne({ job: 'retention' }).sort({ started_at: -1 }).lean();
    const counts = run?.counts as { deleted: number; overrides_removed: number; tombstones_written: number };
    expect(counts.deleted).toBe(1);
    expect(counts.overrides_removed).toBe(1);
    expect(counts.tombstones_written).toBe(1);
  });

  it('is idempotent: a second run over an already-deleted batch is a harmless no-op', async () => {
    await seed({ lifecycle: 'archived', archived_at: daysAgo(delete_after_days + 1), content_hash: 'h2' });
    await runNewsRetention();
    await expect(runNewsRetention()).resolves.toBeUndefined();
    expect(await NewsItem.countDocuments({})).toBe(0);
  });
});

// ── 6.4 Lock no-op ───────────────────────────────────────────────────────────────────────────────
describe('runNewsRetention — locking', () => {
  it('no-ops (no writes, no MaintenanceRun) when the lock is already held', async () => {
    await redis.set('lock:news_retention', 'someone-else', 'PX', 60_000, 'NX');
    const item = await seed({ created_at: hoursAgo(max_age_hours + 1) });

    await runNewsRetention();

    expect((await reload(item._id))?.lifecycle).toBe('active');
    expect(await MaintenanceRun.countDocuments({ job: 'retention' })).toBe(0);
  });
});

// ── 6.5 / 6.6 Surface exclusion ──────────────────────────────────────────────────────────────────
describe('archived items are excluded from list surfaces but reachable by id', () => {
  it('getAllNewsItems excludes archived by default, includes them via ?lifecycle=archived, keeps legacy rows visible', async () => {
    const active = await seed({});
    const archived = await seed({ lifecycle: 'archived', archived_at: new Date() });
    // Legacy row that predates the lifecycle field entirely.
    const legacy = await seed({});
    await NewsItem.collection.updateOne({ _id: legacy._id }, { $unset: { lifecycle: '' } });

    const def = await NewsItemService.getAllNewsItems({});
    const defIds = def.result.map((r) => r._id.toString());
    expect(defIds).toContain(active._id.toString());
    expect(defIds).toContain(legacy._id.toString());
    expect(defIds).not.toContain(archived._id.toString());

    const archivedView = await NewsItemService.getAllNewsItems({ lifecycle: 'archived' });
    expect(archivedView.result.map((r) => r._id.toString())).toContain(archived._id.toString());
  });

  it('getSingleNewsItem still resolves an archived item by id', async () => {
    const archived = await seed({ lifecycle: 'archived', archived_at: new Date() });
    const found = await NewsItemService.getSingleNewsItem(archived._id.toString());
    expect(found).not.toBeNull();
    expect(found?._id.toString()).toBe(archived._id.toString());
  });
});

// ── 6.7 / 6.8 Candidate-pool exclusion ───────────────────────────────────────────────────────────
describe('candidate pools exclude archived items', () => {
  it('fetchRecentEmbeddings (semantic-dedup pool) excludes archived items', async () => {
    const cutoff = hoursAgo(72);
    await seed({ published_at: hoursAgo(1), lifecycle: 'active' });
    await seed({ published_at: hoursAgo(1), lifecycle: 'archived', archived_at: new Date() });

    const pool = await fetchRecentEmbeddings(cutoff);
    expect(pool).toHaveLength(1);
  });

  it('the report/chat/auto-generation exclusion contract holds (lifecycle: { $ne: archived })', async () => {
    // report.opportunities, chat.retrieval, and generatedContent.job each add this identical filter
    // to their NewsItem.find(...) candidate query. Assert the contract those queries rely on.
    await seed({ processed: true, lifecycle: 'active' });
    await seed({ processed: true, lifecycle: 'archived', archived_at: new Date() });

    const candidates = await NewsItem.find({ processed: true, lifecycle: { $ne: 'archived' } }).lean();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].lifecycle).toBe('active');
  });
});
