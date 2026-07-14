import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);
import { embed } from '../app/lib/embeddings';
import { EmbeddedNewsItem, dedupeSemantic, fetchRecentEmbeddings } from '../app/modules/NewsIngestion/newsIngestion.utils';

const rawItem = (
  sourceId: string,
  title: string,
  snippet: string,
  points: number,
): Omit<EmbeddedNewsItem, 'embedding'> => ({
  source: 'live-verify',
  source_id: sourceId,
  content_hash: `live-verify:${sourceId}`,
  title,
  url: `https://example.com/${sourceId}`,
  snippet,
  raw_points: points,
  raw_comments: 0,
  raw_stars_delta: 0,
});

async function main() {
  await mongoose.connect(config.database_url as string);

  const candidates = [
    rawItem(
      'a-hn',
      'OpenAI releases GPT-5.5 with major reasoning improvements',
      'The new model shows significant gains on math and coding benchmarks compared to its predecessor.',
      50,
    ),
    rawItem(
      'b-devto',
      'GPT-5.5 launches from OpenAI, bringing big reasoning upgrades',
      'OpenAI just shipped an updated model with large improvements to math and coding benchmark performance.',
      300,
    ),
    rawItem(
      'c-reddit',
      'Show HN: I built a CLI tool to manage dotfiles across machines',
      'A small Rust utility that syncs your shell config, vim settings, and aliases between computers.',
      12,
    ),
  ];

  console.log('Embedding 3 candidate items via real OpenRouter embeddings...');
  const embedded: EmbeddedNewsItem[] = await Promise.all(
    candidates.map(async (item) => ({ ...item, embedding: await embed(`${item.title} ${item.snippet}`.trim()) })),
  );

  const sim = (a: number[], b: number[]) => {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  };
  console.log(
    `Cosine similarity — GPT-5.5 (HN) vs GPT-5.5 (Dev.to): ${sim(embedded[0].embedding, embedded[1].embedding).toFixed(4)}`,
  );
  console.log(
    `Cosine similarity — GPT-5.5 (HN) vs dotfiles CLI (unrelated): ${sim(embedded[0].embedding, embedded[2].embedding).toFixed(4)}`,
  );

  const cutoff = new Date(Date.now() - config.news_ingestion.max_age_hours * 60 * 60 * 1000);
  const recentPool = await fetchRecentEmbeddings(cutoff);
  console.log(`Recently-stored pool size (real NewsItem docs, last ${config.news_ingestion.max_age_hours}h): ${recentPool.length}`);

  const threshold = config.news_ingestion.semantic_dedup_threshold;
  console.log(`Threshold: ${threshold}`);

  const survivors = dedupeSemantic(embedded, recentPool, threshold);
  console.log(`\n3 candidates in -> ${survivors.length} survived semantic dedup:`);
  survivors.forEach((s) => console.log(`  - ${s.source_id}: "${s.title}"`));

  const survivedIds = new Set(survivors.map((s) => s.source_id));
  const gptDuplicateCollapsed = survivedIds.has('a-hn') !== survivedIds.has('b-devto');
  const higherEngagementKept = survivedIds.has('b-devto') && !survivedIds.has('a-hn');
  const distinctSurvived = survivedIds.has('c-reddit');

  console.log('\n--- Results ---');
  console.log(`[5.1] Near-duplicate pair (HN "a", Dev.to "b") collapsed to one: ${gptDuplicateCollapsed ? 'PASS' : 'FAIL'}`);
  console.log(`      Higher-engagement one (Dev.to, 300 points) kept over HN (50 points): ${higherEngagementKept ? 'PASS' : 'FAIL'}`);
  console.log(`[5.2] Distinct unrelated item (dotfiles CLI) survived untouched: ${distinctSurvived ? 'PASS' : 'FAIL'}`);

  await mongoose.disconnect();
  process.exit(gptDuplicateCollapsed && higherEngagementKept && distinctSurvived ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
