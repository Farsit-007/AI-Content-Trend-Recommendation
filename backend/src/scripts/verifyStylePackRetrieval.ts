/**
 * Human-in-the-loop retrieval-quality check: embeds a topic string live, cosine-ranks a style
 * pack's examples against it, and prints the top 5 with scores. Whether text-embedding-3-small
 * ranks Bangla content sensibly is a judgment call a human needs to eyeball — this script makes
 * that check take about two minutes. Required before wiring packs into generation (change 6B).
 *
 * Run: npm run verify:style-pack-retrieval -- <slug> "<topic>"
 */
import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);

import { embed } from '../app/lib/embeddings';
import { cosineSimilarity } from '../app/lib/similarity';
import { StyleExample, StylePack } from '../app/modules/StylePack/stylePack.model';

const [, , slug, topic] = process.argv;

const main = async () => {
  if (!slug || !topic) {
    console.error('Usage: npm run verify:style-pack-retrieval -- <slug> "<topic>"');
    process.exit(1);
  }

  await mongoose.connect(config.database_url as string);

  const pack = await StylePack.findOne({ slug });
  if (!pack) {
    console.error(`[verifyStylePackRetrieval] pack "${slug}" not found`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const packId = (pack._id as mongoose.Types.ObjectId).toString();
  const examples = await StyleExample.find(
    { style_pack_id: packId },
    { content: 1, embedding: 1, embedding_source: 1 },
  );
  if (examples.length === 0) {
    console.error(`[verifyStylePackRetrieval] pack "${slug}" has no examples — seed it first`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`[verifyStylePackRetrieval] pack "${pack.name}" (${examples.length} examples), topic: "${topic}"\n`);

  const topicEmbedding = await embed(topic);
  const ranked = examples
    .map((example) => ({
      content: example.content,
      // Predates the field entirely on old rows that haven't been backfilled/migrated yet
      // (style-example-topic-summary-embeddings) — 'content' is the correct interpretation either way.
      embedding_source: example.embedding_source ?? 'content',
      similarity: cosineSimilarity(topicEmbedding, example.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  ranked.forEach((example, index) => {
    console.log(`${index + 1}. score=${example.similarity.toFixed(4)} [embedding_source=${example.embedding_source}]`);
    console.log(`   ${example.content.slice(0, 200)}${example.content.length > 200 ? '…' : ''}\n`);
  });

  console.log('Human check: are the top-ranked examples topically sensible for the given topic?');

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[verifyStylePackRetrieval] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
