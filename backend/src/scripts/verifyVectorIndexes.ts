import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';
import { embed } from '../app/lib/embeddings';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';

// Same local DNS workaround as createVectorIndexes.ts — see backend-scaffold
// tasks.md 7.2. Harmless no-op on machines without the quirk.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;

const waitUntilReady = async (collectionName: string, indexName: string): Promise<void> => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongoose connection not established');
  const coll = db.collection(collectionName);
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const [index] = (await coll.listSearchIndexes(indexName).toArray()) as { queryable?: boolean }[];
    if (index?.queryable) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`index ${indexName} did not become queryable within ${POLL_TIMEOUT_MS}ms`);
};

interface VerifyTarget {
  label: string;
  collectionName: string;
  indexName: string;
  seed: () => Promise<{ id: mongoose.Types.ObjectId; cleanup: () => Promise<void> }>;
}

const verifyTargets = async (vector: number[]): Promise<VerifyTarget[]> => [
  {
    label: 'news_items',
    collectionName: 'news_items',
    indexName: 'news_items_vector_index',
    seed: async () => {
      const doc = await NewsItem.create({
        source: '__verify__',
        source_id: `verify-${Date.now()}`,
        content_hash: `verify-${Date.now()}-${Math.random()}`,
        title: '__verify__',
        url: 'https://example.com/verify',
        embedding: vector,
      });
      return { id: doc._id, cleanup: async () => NewsItem.deleteOne({ _id: doc._id }).exec().then(() => undefined) };
    },
  },
  {
    label: 'brand_voice_examples',
    collectionName: 'brand_voice_examples',
    indexName: 'brand_voice_vector_index',
    seed: async () => {
      const doc = await BrandVoiceExample.create({
        platform: '__verify__',
        content: '__verify__',
        embedding: vector,
      });
      return {
        id: doc._id,
        cleanup: async () => BrandVoiceExample.deleteOne({ _id: doc._id }).exec().then(() => undefined),
      };
    },
  },
];

const runVectorSearch = async (
  collectionName: string,
  indexName: string,
  vector: number[],
): Promise<number> => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongoose connection not established');
  const results = await db
    .collection(collectionName)
    .aggregate([
      {
        $vectorSearch: {
          index: indexName,
          path: 'embedding',
          queryVector: vector,
          numCandidates: 20,
          limit: 5,
        },
      },
      { $project: { _id: 1 } },
    ])
    .toArray();
  return results.length;
};

// Atlas Search/Vector indexes are near-real-time, not synchronous — a
// freshly-inserted document can take a few seconds to become searchable even
// though the index itself already reports queryable: true. Retry the query
// rather than treating one empty result as a hard failure.
const runVectorSearchWithRetry = async (
  collectionName: string,
  indexName: string,
  vector: number[],
): Promise<number> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastCount = 0;
  while (Date.now() < deadline) {
    lastCount = await runVectorSearch(collectionName, indexName, vector);
    if (lastCount > 0) return lastCount;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return lastCount;
};

const verifyVectorIndexes = async (): Promise<void> => {
  await mongoose.connect(config.database_url as string);

  const vector = await embed('growth studio vector index verification probe');
  const targets = await verifyTargets(vector);

  const results: { label: string; pass: boolean; detail: string }[] = [];

  for (const target of targets) {
    let cleanup: (() => Promise<void>) | undefined;
    try {
      await waitUntilReady(target.collectionName, target.indexName);
      const seeded = await target.seed();
      cleanup = seeded.cleanup;

      const matchCount = await runVectorSearchWithRetry(target.collectionName, target.indexName, vector);
      if (matchCount > 0) {
        results.push({ label: target.label, pass: true, detail: `${matchCount} result(s) returned` });
      } else {
        results.push({ label: target.label, pass: false, detail: 'query succeeded but returned zero results' });
      }
    } catch (err) {
      results.push({
        label: target.label,
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (cleanup) await cleanup();
    }
  }

  await mongoose.disconnect();

  for (const result of results) {
    const status = result.pass ? 'PASS' : 'FAIL';
    console.log(`[verifyVectorIndexes] ${result.label}: ${status} — ${result.detail}`);
  }

  if (results.some((r) => !r.pass)) {
    throw new Error('one or more vector index verifications failed');
  }
};

verifyVectorIndexes()
  .then(() => {
    console.log('[verifyVectorIndexes] all indexes verified');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[verifyVectorIndexes] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
