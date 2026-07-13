import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

// Workaround for a local Windows/Docker Desktop DNS quirk (see backend-scaffold
// tasks.md 7.2) where the resolver is pinned to 127.0.0.1 and SRV lookups for
// mongodb+srv:// fail with ECONNREFUSED. Harmless no-op on machines without it.
dns.setServers(['8.8.8.8', '1.1.1.1']);

interface VectorIndexSpec {
  collection: string;
  indexName: string;
}

const VECTOR_INDEXES: VectorIndexSpec[] = [
  { collection: 'news_items', indexName: 'news_items_vector_index' },
  { collection: 'brand_voice_examples', indexName: 'brand_voice_vector_index' },
  { collection: 'platform_posts', indexName: 'platform_posts_vector_index' },
];

const vectorSearchDefinition = {
  fields: [
    {
      type: 'vector' as const,
      path: 'embedding',
      numDimensions: 1536,
      similarity: 'cosine' as const,
    },
  ],
};

const createVectorIndexes = async (): Promise<void> => {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongoose connection not established');

  for (const { collection, indexName } of VECTOR_INDEXES) {
    // listSearchIndexes/createSearchIndex require the collection namespace to
    // already exist — Atlas won't lazily create it the way normal writes do.
    await db.createCollection(collection).catch((err) => {
      if (err instanceof Error && err.message.includes('already exists')) return;
      throw err;
    });

    const coll = db.collection(collection);
    const existing = await coll.listSearchIndexes(indexName).toArray().catch(() => []);

    if (existing.length > 0) {
      console.log(`[createVectorIndexes] ${collection}.${indexName}: already exists, skipping`);
      continue;
    }

    await coll.createSearchIndex({
      name: indexName,
      type: 'vectorSearch',
      definition: vectorSearchDefinition,
    });
    console.log(`[createVectorIndexes] ${collection}.${indexName}: created`);
  }

  await mongoose.disconnect();
};

createVectorIndexes()
  .then(() => {
    console.log('[createVectorIndexes] done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[createVectorIndexes] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
