export interface INewsItemCategoryOverride {
  news_item_id: string;
  team_id: string;
  category?: string;
  opportunity_score?: number;
  overridden_by: string;
  overridden_at: Date;
}
