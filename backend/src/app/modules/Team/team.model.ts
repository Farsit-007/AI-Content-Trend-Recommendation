import { Schema, model } from 'mongoose';
import { ITeam, ITeamMembership, ITeamVoiceProfile } from './team.interface';

const voiceProfileSchema = new Schema<ITeamVoiceProfile>(
  {
    default_language: {
      type: String,
      enum: ['bangla', 'english', 'banglish'],
      default: 'bangla',
    },
    custom_instructions: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const teamSchema = new Schema<ITeam>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  created_by: { type: String, required: true },
  custom_categories: { type: [String], default: [] },
  subscribed_categories: { type: [String], default: [] },
  default_style_pack_id: { type: String, default: null },
  default_models: { type: Schema.Types.Mixed, default: () => ({}) },
  voice_profile: { type: voiceProfileSchema, default: () => ({}) },
  created_at: { type: Date, default: Date.now },
});

export const Team = model<ITeam>('Team', teamSchema, 'teams');

const teamMembershipSchema = new Schema<ITeamMembership>({
  team_id: { type: String, required: true },
  // ObjectId + ref so `.populate('user_id', 'name email role')` (getTeamById) can actually
  // resolve the User document — a plain String field can't be populated.
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
});

// A user can only be added to a given team once; membership rows are looked up from both sides.
teamMembershipSchema.index({ team_id: 1, user_id: 1 }, { unique: true });
teamMembershipSchema.index({ user_id: 1 });

export const TeamMembership = model<ITeamMembership>(
  'TeamMembership',
  teamMembershipSchema,
  'team_memberships',
);
