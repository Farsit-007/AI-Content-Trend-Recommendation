import { cosineSimilarity } from '../../lib/similarity';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { PlatformPost } from '../PlatformPost/platformPost.model';
import { FewShotExample } from './contentGeneration.interface';

const BRAND_VOICE_LIMIT = 3;
const PLATFORM_POST_ENGAGEMENT_POOL_SIZE = 20;
const PLATFORM_POST_LIMIT = 3;

export interface BrandVoiceCandidate {
  content: string;
  embedding: number[];
  engagement_hint?: string;
}

export interface PlatformPostCandidate {
  content_snippet: string;
  embedding: number[];
  metrics: { reach: number; likes: number; comments: number; shares: number };
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
 * Linear ranking score used only to pick the top-N candidate pool before similarity
 * ranking — never shown to the user, unlike newsIngestion.scoring.ts's 0-10 display scores.
 * Comments/shares weighted highest since they're the most active engagement signals.
 */
const engagementScore = (metrics: PlatformPostCandidate['metrics']): number =>
  metrics.reach + metrics.likes * 2 + metrics.comments * 3 + metrics.shares * 4;

/** Pure two-stage ranking (top-N by engagement, then top-M by similarity), testable without Mongo. */
export const rankPlatformPosts = (
  candidates: PlatformPostCandidate[],
  topicEmbedding: number[],
  limit: number = PLATFORM_POST_LIMIT,
  engagementPoolSize: number = PLATFORM_POST_ENGAGEMENT_POOL_SIZE,
): FewShotExample[] => {
  const topByEngagement = candidates
    .slice()
    .sort((a, b) => engagementScore(b.metrics) - engagementScore(a.metrics))
    .slice(0, engagementPoolSize);

  return topByEngagement
    .map((post) => ({
      similarity: cosineSimilarity(topicEmbedding, post.embedding),
      content: post.content_snippet,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ content }) => ({
      source: 'platform_post' as const,
      content,
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

export const fetchTopPerformingPosts = async (
  teamId: string,
  topicEmbedding: number[],
): Promise<FewShotExample[]> => {
  const posts = await PlatformPost.find(
    { team_id: teamId, content_snippet: { $exists: true, $ne: '' } },
    { content_snippet: 1, embedding: 1, metrics: 1 },
  );
  return rankPlatformPosts(
    posts.map((post) => ({
      content_snippet: post.content_snippet as string,
      embedding: post.embedding,
      metrics: post.metrics,
    })),
    topicEmbedding,
  );
};
