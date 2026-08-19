import { Schema, model } from 'mongoose';
import { INewsItemTeamScore } from './newsItemTeamScore.interface';

const newsItemTeamScoreSchema = new Schema<INewsItemTeamScore>({
  news_item_id: { type: Schema.Types.ObjectId, ref: 'NewsItem', required: true },
  team_id: { type: String, required: true },
  relevance_score: { type: Number, required: true },
  opportunity_score: { type: Number, required: true },
  computed_at: { type: Date, default: Date.now },
});

// One score per (item, team). Also the lookup path when merging scores into a page of feed results.
newsItemTeamScoreSchema.index({ news_item_id: 1, team_id: 1 }, { unique: true });

// The ranking path: "this team's highest-opportunity items", used by the feed's default sort and by
// the auto-generation job's per-team pick. Descending to match how it is always read.
newsItemTeamScoreSchema.index({ team_id: 1, opportunity_score: -1 });

// Rows are meaningless once their item is gone. The retention job hard-deletes items, so it deletes
// these alongside; this index makes that cleanup a targeted delete rather than a scan.
newsItemTeamScoreSchema.index({ news_item_id: 1 });

export const NewsItemTeamScore = model<INewsItemTeamScore>(
  'NewsItemTeamScore',
  newsItemTeamScoreSchema,
  'news_item_team_scores',
);
