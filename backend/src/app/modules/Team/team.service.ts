import AppError from '../../errors/AppError';
import { httpStatus } from '../../utils/httpStatus';
import { User } from '../User/user.model';
import { IRequestUser } from '../User/user.interface';
import { NEWS_CATEGORIES } from '../NewsIngestion/newsIngestion.interface';
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
  if (requestingUser.role === 'admin') {
    return Team.find();
  }
  return Team.find({ _id: { $in: requestingUser.team_ids } });
};

const getTeamById = async (teamId: string) => {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }

  const memberships = await TeamMembership.find({ team_id: teamId }).populate('user_id', 'name email role');
  return { team, members: memberships.map((m) => m.user_id) };
};

const updateTeam = async (
  teamId: string,
  payload: Partial<Pick<ITeam, 'name' | 'description' | 'voice_profile'>>,
) => {
  const team = await Team.findByIdAndUpdate(teamId, payload, { new: true, runValidators: true });
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

const getEffectiveCategories = async (teamId: string): Promise<string[]> => {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }
  return [...NEWS_CATEGORIES, ...team.custom_categories];
};

const addCustomCategory = async (teamId: string, category: string) => {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }

  const existing = [...NEWS_CATEGORIES, ...team.custom_categories].map((c) => c.toLowerCase());
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
};
