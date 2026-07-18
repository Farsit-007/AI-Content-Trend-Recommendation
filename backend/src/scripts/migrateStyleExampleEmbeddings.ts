/**
 * One-off migration: re-embeds a style pack's existing examples using the topic-summary strategy
 * (style-example-topic-summary-embeddings) — only meaningful once `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY`
 * has been turned on. Thin wrapper around `stylePack.embeddingStrategy.ts`'s
 * `backfillMissingEmbeddingSource`/`migrateExamplesForPack`, so this script and any future API
 * entry point can never drift (same pattern as `generateStyleCard.ts`).
 *
 * Run: npm run migrate:style-example-embeddings -- <slug>
 */
import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);

import { backfillMissingEmbeddingSource, migrateExamplesForPack } from '../app/modules/StylePack/stylePack.embeddingStrategy';
import { StylePack } from '../app/modules/StylePack/stylePack.model';

const [, , slug] = process.argv;

const main = async () => {
  if (!slug) {
    console.error('Usage: npm run migrate:style-example-embeddings -- <slug>');
    process.exit(1);
  }
  if (!config.style_packs.embed_examples_by_topic_summary) {
    console.warn(
      '[migrateStyleExampleEmbeddings] STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY is false — migrating anyway, ' +
        'but new examples will keep using content embeddings until the flag is enabled.',
    );
  }

  await mongoose.connect(config.database_url as string);

  const backfilled = await backfillMissingEmbeddingSource();
  if (backfilled > 0) {
    console.log(`[migrateStyleExampleEmbeddings] backfilled embedding_source on ${backfilled} pre-existing example(s)`);
  }

  const pack = await StylePack.findOne({ slug });
  if (!pack) {
    console.error(`[migrateStyleExampleEmbeddings] pack "${slug}" not found`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const packId = (pack._id as mongoose.Types.ObjectId).toString();

  const { migrated, failed, candidates } = await migrateExamplesForPack(packId);

  if (candidates === 0) {
    console.log(`[migrateStyleExampleEmbeddings] pack "${pack.name}": nothing to migrate — all examples already use topic_summary embeddings`);
  } else {
    console.log(
      `[migrateStyleExampleEmbeddings] pack "${pack.name}": ${migrated} migrated, ${failed} extraction failure(s) left ` +
        `unchanged (still usable, re-run to retry), ${candidates} candidate(s) processed`,
    );
  }

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[migrateStyleExampleEmbeddings] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
