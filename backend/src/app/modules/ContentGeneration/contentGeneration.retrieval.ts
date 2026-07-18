import { cosineSimilarity } from '../../lib/similarity';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { StyleExample } from '../StylePack/stylePack.model';
import { FewShotExample } from './contentGeneration.interface';

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

/** Pure ranking step for style-pack examples, mirroring rankBrandVoiceExamples but for the pack's own corpus. */
export const rankStyleExamples = (
  candidates: StyleExampleCandidate[],
  topicEmbedding: number[],
  limit: number = STYLE_EXAMPLE_LIMIT,
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
      source: 'style_pack_example' as const,
      content,
      engagement_hint,
    }));

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

export const fetchTopStyleExamples = async (
  packId: string,
  topicEmbedding: number[],
): Promise<FewShotExample[]> => {
  const examples = await StyleExample.find(
    { style_pack_id: packId },
    { content: 1, embedding: 1, engagement_hint: 1 },
  );
  return rankStyleExamples(examples, topicEmbedding);
};
