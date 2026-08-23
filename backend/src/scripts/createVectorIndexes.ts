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
  /**
   * Scalar fields usable in a `$vectorSearch` `filter`. These must be declared on the index — a
   * filter naming a field that isn't declared is rejected, it does not silently degrade. Declaring
   * them lets the filter run *during* the search, so the `limit` is spent on eligible documents
   * rather than being consumed by ones a later `$match` would discard.
   */
  filterFields?: string[];
}

const VECTOR_INDEXES: VectorIndexSpec[] = [
  {
    collection: 'news_items',
    indexName: 'news_items_vector_index',
    // Chat context retrieval pre-filters on all four (see Chat/chat.vectorRetrieval.ts).
    //
    // `category` and `category_group` were added when chat became team-scoped: the scope is the
    // asking team's subscribed categories, and applying it *after* the vector search would spend
    // the search limit on other teams' items and then discard them. An index created before this
    // change lacks the two new paths, so the warning below will fire — drop and recreate it in
    // Atlas before enabling CHAT_VECTOR_SEARCH_ENABLED, or the filtered search fails and chat
    // silently falls back to the in-memory path (correct, but slower and capped).
    filterFields: ['lifecycle', 'created_at', 'category', 'category_group'],
  },
  {
    collection: 'brand_voice_examples',
    indexName: 'brand_voice_vector_index',
    filterFields: ['team_id'],
  },
];

const buildDefinition = (filterFields: string[] = []) => ({
  fields: [
    {
      type: 'vector' as const,
      path: 'embedding',
      numDimensions: 1536,
      similarity: 'cosine' as const,
    },
    ...filterFields.map((path) => ({ type: 'filter' as const, path })),
  ],
});

const createVectorIndexes = async (): Promise<void> => {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongoose connection not established');

  for (const { collection, indexName, filterFields } of VECTOR_INDEXES) {
    // listSearchIndexes/createSearchIndex require the collection namespace to
    // already exist — Atlas won't lazily create it the way normal writes do.
    await db.createCollection(collection).catch((err) => {
      if (err instanceof Error && err.message.includes('already exists'))
        return;
      throw err;
    });

    const coll = db.collection(collection);
    const existing = await coll
      .listSearchIndexes(indexName)
      .toArray()
      .catch(() => []);

    if (existing.length > 0) {
      // An index created before `filterFields` existed has no filter paths, so a filtered
      // $vectorSearch against it fails. Say so rather than reporting a clean skip — the fix is a
      // manual drop-and-recreate in Atlas, which this script deliberately does not do unprompted.
      const declared = (
        (
          existing[0] as {
            latestDefinition?: { fields?: { type: string; path: string }[] };
          }
        ).latestDefinition?.fields ?? []
      )
        .filter((f) => f.type === 'filter')
        .map((f) => f.path);
      const missing = (filterFields ?? []).filter((f) => !declared.includes(f));
      if (missing.length > 0) {
        console.warn(
          `[createVectorIndexes] ${collection}.${indexName}: EXISTS but is missing filter field(s) ` +
            `[${missing.join(', ')}]. Filtered $vectorSearch queries will fail against it. ` +
            'Drop the index in Atlas and re-run this script to recreate it.',
        );
      } else {
        console.log(
          `[createVectorIndexes] ${collection}.${indexName}: already exists, skipping`,
        );
      }
      continue;
    }

    await coll.createSearchIndex({
      name: indexName,
      type: 'vectorSearch',
      definition: buildDefinition(filterFields),
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
    console.error(
      '[createVectorIndexes] failed:',
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  });
