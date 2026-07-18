import { cosineSimilarity } from '../../lib/similarity';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { StyleExample } from '../StylePack/stylePack.model';
import { CONTENT_FORMATS, FormatId } from './contentGeneration.formats';
import { FewShotExample } from './contentGeneration.interface';
import { StyleContext } from './contentGeneration.prompt';

const BRAND_VOICE_LIMIT = 3;
const STYLE_EXAMPLE_LIMIT = 5;

export interface BrandVoiceCandidate {
  content: string;
  embedding: number[];
  engagement_hint?: string;
}

export interface StyleExampleCandidate {
  content: string;
  embedding: number[];
  engagement_hint?: string;
  platform: 'facebook' | 'linkedin' | 'other';
}

/** Zero brand-voice examples is the cold-start signal — callers skip all retrieval on this. */
export const hasBrandVoiceExamples = async (teamId: string): Promise<boolean> => {
  const count = await BrandVoiceExample.countDocuments({ team_id: teamId });
  return count > 0;
};

/** Pure ranking step, kept separate from the DB fetch so it's testable without Mongo. */
export const rankBrandVoiceExamples = (
  candidates: BrandVoiceCandidate[],
  topicEmbedding: number[],
  limit: number = BRAND_VOICE_LIMIT,
): FewShotExample[] =>
  candidates
    .map((candidate) => ({
      similarity: cosineSimilarity(topicEmbedding, candidate.embedding),
      content: candidate.content,
      engagement_hint: candidate.engagement_hint,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ content, engagement_hint }) => ({
      source: 'brand_voice_example' as const,
      content,
      engagement_hint,
    }));

/**
 * Pure ranking step for style-pack examples, mirroring rankBrandVoiceExamples but for the pack's
 * own corpus, with an optional platform preference (design.md decision 2 of
 * style-platform-aware-retrieval): with no `preferredPlatform`, behavior is unchanged — plain
 * similarity ranking, top `limit`. With a `preferredPlatform`, platform-matching examples are
 * ranked first (by similarity, up to `limit`); if there are fewer than `limit` matches, the
 * remainder is backfilled from the rest of the pack's examples, still ranked by similarity. This
 * can only match or improve on plain-similarity selection — it never drops an example that
 * plain-similarity ranking would have included, it can only reorder which ones make the cut.
 */
export const rankStyleExamples = (
  candidates: StyleExampleCandidate[],
  topicEmbedding: number[],
  preferredPlatform?: 'facebook' | 'linkedin',
  limit: number = STYLE_EXAMPLE_LIMIT,
): FewShotExample[] => {
  const scored = candidates
    .map((candidate) => ({
      similarity: cosineSimilarity(topicEmbedding, candidate.embedding),
      content: candidate.content,
      engagement_hint: candidate.engagement_hint,
      platform: candidate.platform,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const selected = (() => {
    if (!preferredPlatform) return scored.slice(0, limit);
    const matches = scored.filter((c) => c.platform === preferredPlatform).slice(0, limit);
    if (matches.length >= limit) return matches;
    const backfill = scored.filter((c) => c.platform !== preferredPlatform).slice(0, limit - matches.length);
    return [...matches, ...backfill];
  })();

  return selected.map(({ content, engagement_hint }) => ({
    source: 'style_pack_example' as const,
    content,
    engagement_hint,
  }));
};

export const fetchTopBrandVoiceExamples = async (
  teamId: string,
  topicEmbedding: number[],
): Promise<FewShotExample[]> => {
  const examples = await BrandVoiceExample.find(
    { team_id: teamId },
    { content: 1, embedding: 1, engagement_hint: 1 },
  );
  return rankBrandVoiceExamples(examples, topicEmbedding);
};

/**
 * DB read only, no ranking — split out from the old fetch+rank-in-one `fetchTopStyleExamples` so a
 * multi-format generation request can fetch a resolved pack's examples once and rank them
 * separately per format (each format has its own platform preference; see
 * `contentGeneration.service.ts`).
 */
export const fetchStylePackExamples = async (packId: string): Promise<StyleExampleCandidate[]> => {
  const examples = await StyleExample.find(
    { style_pack_id: packId },
    { content: 1, embedding: 1, engagement_hint: 1, platform: 1 },
  );
  return examples;
};

/**
 * Builds the style-conditioned prompt block for one format, or `undefined` when no pack is active.
 * Extracted out of `contentGeneration.service.ts`'s per-format generation loop (previously inline)
 * so it's a single, named, reusable seam — the bake-off harness (`contentGeneration.bakeoff.ts`)
 * calls this exact function too, so its prompts can never silently drift from what a live request
 * actually sends (bangla-quality-bakeoff-harness design.md decision 1).
 */
export const buildStyleContext = (
  format: FormatId,
  stylePack: { style_card?: string } | null,
  stylePackExamples: StyleExampleCandidate[] | null,
  topicEmbedding: number[],
): StyleContext | undefined =>
  stylePack && stylePackExamples
    ? { card: stylePack.style_card, examples: rankStyleExamples(stylePackExamples, topicEmbedding, CONTENT_FORMATS[format].preferredPlatform) }
    : undefined;
