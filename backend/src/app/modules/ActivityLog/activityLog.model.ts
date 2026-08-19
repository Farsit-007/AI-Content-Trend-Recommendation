import { Schema, model } from 'mongoose';
import { IActivityLogEntry } from './activityLog.interface';

const ACTIONS: IActivityLogEntry['action'][] = [
  'content.generated',
  'content.refined',
  'content.draft_saved',
  'content.draft_approved',
  'content.draft_dismissed',
  'team.settings_updated',
  'team.member_added',
  'team.member_removed',
  'team.member_role_changed',
  'news.category_corrected',
  'llm.key_revealed',
];

const activityLogSchema = new Schema<IActivityLogEntry>({
  team_id: { type: String, required: true },
  actor_id: { type: String, required: true },
  actor_name: { type: String, required: true },
  actor_email: { type: String, required: true },
  action: { type: String, enum: ACTIONS, required: true },
  summary: { type: String, required: true },
  target_type: { type: String, enum: ['generated_content', 'team', 'news_item', 'llm_provider_key'] },
  target_id: { type: String },
  metadata: { type: Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
});

activityLogSchema.index({ team_id: 1, created_at: -1 });

export const ActivityLogEntry = model<IActivityLogEntry>(
  'ActivityLogEntry',
  activityLogSchema,
  'activity_log_entries',
);
