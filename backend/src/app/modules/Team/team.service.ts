import AppError from '../../errors/AppError';
import { httpStatus } from '../../utils/httpStatus';
import { User } from '../User/user.model';
import { IRequestUser } from '../User/user.interface';
import { NewsCategoryTaxonomyService } from '../NewsCategoryTaxonomy/newsCategoryTaxonomy.service';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { ITeam } from './team.interface';
import { Team, TeamMembership } from './team.model';

const MAX_CUSTOM_CATEGORIES = 20;

/** Every team id a user belongs to. Used by `requireAuth` to populate `req.user.team_ids`. */
const getTeamIdsForUser = async (userId: string): Promise<string[]> => {
  const memberships = await TeamMembership.find({ user_id: userId }).select('team_id');
  return memberships.map((m) => m.team_id.toString());
};

const createTeam = async (
  payload: { name: string; description?: string },
  memberUserIds: string[],
  createdBy: string,
) => {
  const team = await Team.create({ ...payload, created_by: createdBy });

  if (memberUserIds.length) {
    const users = await User.find({ _id: { $in: memberUserIds } }).select('_id');
    if (users.length !== new Set(memberUserIds).size) {
      throw new AppError(httpStatus.BAD_REQUEST, 'One or more member user ids do not exist');
    }
    await TeamMembership.insertMany(
      memberUserIds.map((user_id) => ({ team_id: team._id, user_id })),
    );
  }

  return team;
};

const listTeams = async (requestingUser: IRequestUser) => {
  if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin') {
    return Team.find();
  }
  return Team.find({ _id: { $in: requestingUser.team_ids } });
};

const getTeamById = async (teamId: string) => {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }

  const [memberships, team_ready] = await Promise.all([
    TeamMembership.find({ team_id: teamId }).populate('user_id', 'name email role'),
    isTeamReady(teamId),
  ]);
  return { team, members: memberships.map((m) => m.user_id), team_ready };
};

/**
 * A team is "ready" once it has told the system what it cares about (subscribed_categories)
 * and what it sounds like (BrandVoiceExample) — both already-modeled signals, no new fields.
 * Computed on read, never stored, so it can never drift from the underlying data.
 */
const isTeamReady = async (teamId: string): Promise<boolean> => {
  const team = await Team.findById(teamId).select('subscribed_categories').lean();
  if (!team || team.subscribed_categories.length === 0) {
    return false;
  }
  const hasBrandVoice = await BrandVoiceExample.exists({ team_id: teamId });
  return Boolean(hasBrandVoice);
};

const updateTeam = async (
  teamId: string,
  payload: Partial<
    Pick<
      ITeam,
      'name' | 'description' | 'voice_profile' | 'subscribed_categories' | 'default_style_pack_id' | 'default_models'
    >
  >,
) => {
  const dedupedPayload = payload.subscribed_categories
    ? { ...payload, subscribed_categories: [...new Set(payload.subscribed_categories)] }
    : payload;
  const team = await Team.findByIdAndUpdate(teamId, dedupedPayload, { new: true, runValidators: true });
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }
  return team;
};

const deleteTeam = async (teamId: string) => {
  const team = await Team.findByIdAndDelete(teamId);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }
  await TeamMembership.deleteMany({ team_id: teamId });
  return team;
};

const addMember = async (teamId: string, userId: string) => {
  const [team, user] = await Promise.all([Team.findById(teamId), User.findById(userId)]);
  if (!team) throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const existing = await TeamMembership.findOne({ team_id: teamId, user_id: userId });
  if (existing) {
    throw new AppError(httpStatus.CONFLICT, 'User is already a member of this team');
  }

  return TeamMembership.create({ team_id: teamId, user_id: userId });
};

const removeMember = async (teamId: string, userId: string) => {
  const result = await TeamMembership.findOneAndDelete({ team_id: teamId, user_id: userId });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'User is not a member of this team');
  }
  return result;
};

/** Fixed six + every category discovered during ingestion + this team's own custom categories. */
const getEffectiveCategories = async (teamId: string): Promise<string[]> => {
  const [team, taxonomyCategories] = await Promise.all([
    Team.findById(teamId),
    NewsCategoryTaxonomyService.listAllCategoryNames(),
  ]);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }
  return [...new Set([...taxonomyCategories, ...team.custom_categories])];
};

const addCustomCategory = async (teamId: string, category: string) => {
  const [team, taxonomyCategories] = await Promise.all([
    Team.findById(teamId),
    NewsCategoryTaxonomyService.listAllCategoryNames(),
  ]);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }

  const existing = [...taxonomyCategories, ...team.custom_categories].map((c) => c.toLowerCase());
  if (existing.includes(category.toLowerCase())) {
    throw new AppError(httpStatus.BAD_REQUEST, 'That category already exists for this team');
  }
  if (team.custom_categories.length >= MAX_CUSTOM_CATEGORIES) {
    throw new AppError(httpStatus.BAD_REQUEST, `A team may have at most ${MAX_CUSTOM_CATEGORIES} custom categories`);
  }

  team.custom_categories.push(category);
  await team.save();
  return team;
};

const removeCustomCategory = async (teamId: string, category: string) => {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }

  const before = team.custom_categories.length;
  team.custom_categories = team.custom_categories.filter((c) => c.toLowerCase() !== category.toLowerCase());
  if (team.custom_categories.length === before) {
    throw new AppError(httpStatus.NOT_FOUND, 'That custom category does not exist for this team');
  }

  await team.save();
  return team;
};

export const TeamService = {
  getTeamIdsForUser,
  createTeam,
  listTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
  getEffectiveCategories,
  addCustomCategory,
  removeCustomCategory,
  isTeamReady,
};
