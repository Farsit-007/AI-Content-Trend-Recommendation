import { Types } from 'mongoose';

/**
 * One team's view of one news item's relevance and opportunity.
 *
 * Why this exists as a separate collection rather than fields on `news_items`: relevance is the
 * cosine similarity between an item's embedding and *a team's* brand-voice pool, so it has one value
 * per (item, team) pair, not one per item. It previously lived on the shared item as a single number
 * computed against every team's examples pooled together and reduced with `max` — which is correct
 * for exactly one team and wrong for two, because `opportunity_score` derives from it at weight 0.4
 * and drives both the feed's default sort and the auto-generation job's daily picks. A DevOps team
 * could have its feed ordered by how well items matched a different team's Bangla career content.
 *
 * A side collection (mirroring `news_item_category_overrides`) keeps the shared `news_items`
 * document un-mutated and, unlike a read-time computation, keeps the scores sortable in the database
 * — which matters because `-opportunity_score` is the feed's default sort, so ranking a single page
 * after the fact would silently produce wrong pagination.
 */
export interface INewsItemTeamScore {
  news_item_id: Types.ObjectId;
  team_id: string;
  /** 0-10. Max cosine similarity against this team's own brand-voice examples, scaled. */
  relevance_score: number;
  /** 0-10. `computeOpportunityScore(relevance_score, trend_score, audience_fit)` for this team. */
  opportunity_score: number;
  computed_at: Date;
}
