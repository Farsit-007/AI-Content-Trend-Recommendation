/**
 * Optional topic-summary embedding strategy for StyleExample (style-example-topic-summary-embeddings).
 * Off by default — a ready-but-inactive fallback for Gate G1 (unresolved Bangla style-example
 * retrieval quality question; see 9-VISION-V7-V9-WRITER-STYLE-QUALITY-OPENSPEC-PLAN.md and
 * BANGLA-QUALITY-DECISION.md). When enabled, new examples are embedded from an LLM-extracted
 * English topic summary instead of their raw (often Bangla) content, removing the cross-lingual
 * asymmetry between topic queries (frequently English news headlines) and example embeddings.
 * Every function here soft-fails to today's content-embedding behavior on any error — enabling the
 * flag can only match or improve reliability, never regress it.
 */
import config from '../../config';
import { chatCompletionForTask, embedBatchForTask, embedForTask } from '../../lib/modelResolution';
import { logger } from '../../lib/logger';
import { StyleExample } from './stylePack.model';

const SUMMARY_EXTRACTION_INSTRUCTION =
  'In 1-2 sentences, in neutral English, summarize the topic and subject matter of this social ' +
  'media post — not its tone, language, or style, just what it is about. Respond with ONLY the ' +
  'summary text — no labels, no markdown fences, no commentary.';

export interface ResolvedExampleEmbedding {
  embedding: number[];
  embedding_source: 'content' | 'topic_summary';
  topic_summary?: string;
}

/** One cheap LLM call. Soft-fails to null on any error or empty/degenerate response — never throws. */
export const extractTopicSummary = async (content: string): Promise<string | null> => {
  let raw: string;
  try {
    raw = await chatCompletionForTask(
      'style_card',
      [
        { role: 'system', content: SUMMARY_EXTRACTION_INSTRUCTION },
        { role: 'user', content },
      ],
      { temperature: 0.2 },
    );
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      '[StylePack] Topic-summary extraction LLM call failed — falling back to content embedding',
    );
    return null;
  }

  const summary = raw.trim();
  if (summary.length === 0) {
    logger.warn('[StylePack] Topic-summary extraction returned an empty response — falling back to content embedding');
    return null;
  }
  return summary;
};

/**
 * Single-item resolution for `addExample`. When the flag is off, behavior is exactly today's
 * `embed(content)` call, tagged `embedding_source: 'content'`.
 */
export const resolveExampleEmbedding = async (content: string): Promise<ResolvedExampleEmbedding> => {
  if (!config.style_packs.embed_examples_by_topic_summary) {
    return { embedding: await embedForTask('embedding', content), embedding_source: 'content' };
  }

  const summary = await extractTopicSummary(content);
  if (!summary) {
    return { embedding: await embedForTask('embedding', content), embedding_source: 'content' };
  }

  return {
    embedding: await embedForTask('embedding', summary),
    embedding_source: 'topic_summary',
    topic_summary: summary,
  };
};

/**
 * Batch resolution for `addExamplesBulk`/`seedStylePack.ts`. Extracts summaries **sequentially**,
 * not via unbounded `Promise.all` — a batch can be up to 100 items, and firing that many concurrent
 * chat-completion requests risks flooding OpenRouter the same way `lib/embeddings.ts`'s own
 * `embedBatch` doc comment warns against for embeddings calls. This is a low-volume, off-by-default,
 * one-off operation (bulk import, not a hot serving path), so sequential latency is an acceptable
 * trade for staying within the provider's rate-limit tolerance. Once summaries are resolved,
 * whichever text each item ended up with (summary or content) is embedded in exactly one
 * `embedBatch` call, preserving the "one embeddings HTTP call per batch" invariant this module
 * already relies on. One item's extraction failure never affects any other item's resolution.
 */
export const resolveExamplesEmbeddingBatch = async (contents: string[]): Promise<ResolvedExampleEmbedding[]> => {
  const flagOn = config.style_packs.embed_examples_by_topic_summary;

  const summaries: (string | null)[] = [];
  for (const content of contents) {
    summaries.push(flagOn ? await extractTopicSummary(content) : null);
  }

  const textsToEmbed = flagOn ? contents.map((content, i) => summaries[i] ?? content) : contents;
  const embeddings = await embedBatchForTask('embedding', textsToEmbed);

  return contents.map((_, i) => {
    const summary = summaries[i];
    return summary
      ? { embedding: embeddings[i], embedding_source: 'topic_summary' as const, topic_summary: summary }
      : { embedding: embeddings[i], embedding_source: 'content' as const };
  });
};

/**
 * Collection-wide, idempotent backfill for examples created before this field existed. Mirrors the
 * `lifecycle` backfill pattern in `newsRetention.service.ts`. Returns the number of rows touched —
 * 0 on every run after the first.
 */
export const backfillMissingEmbeddingSource = async (): Promise<number> => {
  const result = await StyleExample.updateMany(
    { embedding_source: { $exists: false } },
    { $set: { embedding_source: 'content' } },
  );
  return result.modifiedCount ?? 0;
};

export interface MigratePackResult {
  migrated: number;
  failed: number;
  candidates: number;
}

/**
 * Re-embeds one pack's examples that aren't already `embedding_source: 'topic_summary'`, via the
 * topic-summary strategy. Idempotent — a row is only ever a "candidate" until it succeeds; a failed
 * extraction leaves it as a candidate for the next run rather than marking it in any way, so its
 * existing content-derived embedding stays fully valid for retrieval in the meantime. Shared by the
 * CLI script (`scripts/migrateStyleExampleEmbeddings.ts`) and its own tests, following this
 * module's established thin-script/testable-core pattern.
 */
export const migrateExamplesForPack = async (packId: string): Promise<MigratePackResult> => {
  // Explicit sort: Mongo's natural order is not guaranteed, and this loop's extraction calls are
  // sequential (per-item, in whatever order `candidates` comes back) — a deterministic order makes
  // a partial-failure run reproducible instead of depending on incidental storage order.
  const candidates = await StyleExample.find({
    style_pack_id: packId,
    embedding_source: { $ne: 'topic_summary' },
  }).sort('_id');

  const toEmbed: { id: string; summary: string }[] = [];
  let failed = 0;

  for (const example of candidates) {
    const summary = await extractTopicSummary(example.content);
    if (!summary) {
      failed += 1;
      continue;
    }
    toEmbed.push({ id: (example._id as { toString(): string }).toString(), summary });
  }

  let migrated = 0;
  if (toEmbed.length > 0) {
    const embeddings = await embedBatchForTask(
      'embedding',
      toEmbed.map((entry) => entry.summary),
    );
    await Promise.all(
      toEmbed.map((entry, i) =>
        StyleExample.findByIdAndUpdate(entry.id, {
          embedding: embeddings[i],
          embedding_source: 'topic_summary',
          topic_summary: entry.summary,
        }),
      ),
    );
    migrated = toEmbed.length;
  }

  return { migrated, failed, candidates: candidates.length };
};
