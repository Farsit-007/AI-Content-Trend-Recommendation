import { cosineSimilarity } from '../../lib/similarity';
import { NewsItem } from '../NewsItem/newsItem.model';
import { PlatformPost } from '../PlatformPost/platformPost.model';

const PLATFORM_FORMAT_MAP: Record<string, { platform: string; format: string }> = {
  AI: { platform: 'youtube', format: 'youtube_video_idea' },
  'Web Dev': { platform: 'facebook', format: 'facebook_reel_script' },
  Career: { platform: 'linkedin', format: 'linkedin_post' },
  Security: { platform: 'youtube', format: 'youtube_video_idea' },
  DevOps: { platform: 'linkedin', format: 'linkedin_post' },
  Other: { platform: 'facebook', format: 'facebook_post' },
};

/**
 * Computes audience match score: max cosine similarity between a news embedding
 * and a team's post embeddings, weighted by normalized engagement.
 */
export const computeAudienceMatch = (
  newsEmbedding: number[],
  teamPosts: { embedding: number[]; engagement: number }[],
): number => {
  if (teamPosts.length === 0) return 0;

  const maxEngagement = Math.max(...teamPosts.map((p) => p.engagement), 1);

  let weightedScore = 0;
  let totalWeight = 0;

  for (const post of teamPosts) {
    const sim = cosineSimilarity(newsEmbedding, post.embedding);
    const weight = post.engagement / maxEngagement;
    weightedScore += sim * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedScore / totalWeight : 0;
};

export const getTopOpportunities = async (teamId: string, limit = 5) => {
  const [recentNews, teamPosts] = await Promise.all([
    NewsItem.find({ processed: true })
      .sort({ created_at: -1 })
      .limit(50)
      .select('title embedding trend_score opportunity_score category')
      .lean(),
    PlatformPost.find({ team_id: teamId })
      .select('embedding metrics')
      .lean(),
  ]);

  const teamPostsWithEngagement = teamPosts.map((p) => ({
    embedding: p.embedding,
    engagement: p.metrics.likes + p.metrics.comments + p.metrics.shares,
  }));

  const hasEmbeddings = teamPostsWithEngagement.length > 0;

  const scored = recentNews.map((item) => {
    const audienceMatchScore = hasEmbeddings
      ? computeAudienceMatch(item.embedding, teamPostsWithEngagement)
      : null;

    const score = audienceMatchScore !== null
      ? (item.trend_score ?? 0) * audienceMatchScore
      : item.opportunity_score ?? 0;

    const suggestion = PLATFORM_FORMAT_MAP[item.category ?? 'Other'] ?? PLATFORM_FORMAT_MAP['Other'];

    return {
      news_item_id: item._id.toString(),
      title: item.title,
      audience_match_score: audienceMatchScore,
      trend_score: item.trend_score ?? 0,
      combined_score: score,
      suggested_platform: suggestion.platform,
      suggested_format: suggestion.format,
    };
  });

  return scored
    .sort((a, b) => b.combined_score - a.combined_score)
    .slice(0, limit)
    .map(({ combined_score: _, ...rest }) => rest);
};
