import { Schema, model } from 'mongoose';
import { ITeam, ITeamMembership } from './team.interface';

const teamSchema = new Schema<ITeam>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
});

export const Team = model<ITeam>('Team', teamSchema, 'teams');

const teamMembershipSchema = new Schema<ITeamMembership>({
  team_id: { type: String, required: true },
  user_id: { type: String, required: true },
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
