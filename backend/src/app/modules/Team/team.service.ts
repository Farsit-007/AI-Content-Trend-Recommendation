import AppError from '../../errors/AppError';
import { cached, invalidate } from '../../lib/cache';
import { httpStatus } from '../../utils/httpStatus';
import { User } from '../User/user.model';
import { IRequestUser } from '../User/user.interface';
import { ActivityLogService } from '../ActivityLog/activityLog.service';
import { NewsCategoryTaxonomyService } from '../NewsCategoryTaxonomy/newsCategoryTaxonomy.service';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import {
  LlmModelCapability,
  LlmTask,
} from '../LlmProvider/llmProvider.interface';
import { LlmModel } from '../LlmProvider/llmProvider.model';
import { ITeam, TeamMemberRole } from './team.interface';
import { Team, TeamMembership } from './team.model';

const MAX_CUSTOM_CATEGORIES = 20;

/** Every team id a user belongs to. Used by `requireAuth` to populate `req.user.team_ids`. */
const getTeamIdsForUser = async (userId: string): Promise<string[]> => {
  const memberships = await TeamMembership.find({ user_id: userId }).select(
    'team_id',
  );
  return memberships.map((m) => m.team_id.toString());
};

/** Subset of the above where the user is specifically `team_admin`. Used by `requireAuth` to
 *  populate `req.user.team_admin_team_ids` — see `requireTeamAdmin`. */
const getTeamAdminTeamIdsForUser = async (
  userId: string,
): Promise<string[]> => {
  const memberships = await TeamMembership.find({
    user_id: userId,
    role: 'team_admin',
  }).select('team_id');
  return memberships.map((m) => m.team_id.toString());
};

const createTeam = async (
  payload: { name: string; description?: string },
  memberUserIds: string[],
  createdBy: string,
  teamAdminId?: string,
) => {
  const team = await Team.create({ ...payload, created_by: createdBy });

  if (memberUserIds.length) {
    const users = await User.find({ _id: { $in: memberUserIds } }).select(
      '_id',
    );
    if (users.length !== new Set(memberUserIds).size) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'One or more member user ids do not exist',
      );
    }
    if (teamAdminId && !memberUserIds.includes(teamAdminId)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'team_admin_id must be one of the provided member_ids',
      );
    }
    await TeamMembership.insertMany(
      memberUserIds.map((user_id) => ({
        team_id: team._id,
        user_id,
        role: user_id === teamAdminId ? 'team_admin' : 'member',
      })),
    );
  }

  return team;
};

const listTeams = async (requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') {
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
    TeamMembership.find({ team_id: teamId }).populate(
      'user_id',
      'name email role',
    ),
    isTeamReady(teamId),
  ]);
  // `team_role` (team_admin/member) is distinct from the populated user's own `role` (the global
  // super_admin/user tier) — merged onto the same object here so the frontend gets one flat shape.
  const members = memberships.map((m) => {
    const user = m.user_id as unknown as {
      toObject: () => Record<string, unknown>;
    };
    return { ...user.toObject(), team_role: m.role };
  });
  return { team, members, team_ready };
};

/** Short on purpose — see the comment inside `isTeamReady`. */
const TEAM_READY_TTL_SECONDS = 60;

/**
 * A team is "ready" once it has told the system what it cares about (subscribed_categories)
 * and what it sounds like (BrandVoiceExample) — both already-modeled signals, no new fields.
 * Computed on read, never stored, so it can never drift from the underlying data.
 */
const isTeamReady = async (teamId: string): Promise<boolean> =>
  // Two queries, and it ran on *every* feed and chat request — the single hottest uncached read in
  // the system. Cached briefly rather than long: readiness flips when a team completes setup, and a
  // stale `false` shows them an empty-state screen they have just fixed. A minute is short enough
  // that nobody files a bug about it, and long enough to collapse a page's worth of requests.
  cached('team:ready', teamId, TEAM_READY_TTL_SECONDS, async () => {
    const team = await Team.findById(teamId)
      .select('subscribed_categories')
      .lean();
    if (!team || team.subscribed_categories.length === 0) {
      return false;
    }
    const hasBrandVoice = await BrandVoiceExample.exists({ team_id: teamId });
    return Boolean(hasBrandVoice);
  });

/**
 * Referential check on `default_models`. Request validation already rejects unknown task *keys*
 * (`z.record(llmTaskEnum, objectId)`), but it only checks that each *value* is a well-formed
 * ObjectId — so a valid-looking id for a model that doesn't exist, is deactivated, or lacks the
 * capability the task needs was stored happily. Model resolution then soft-fails past that tier to
 * the global default, which is the right fallback but not what the team asked for and produces no
 * user-visible signal: the setting silently does nothing.
 *
 * Rejecting at write time turns that into an error the admin can act on, at the moment they can.
 */
const assertDefaultModelsResolvable = async (
  defaultModels: ITeam['default_models'],
): Promise<void> => {
  const entries = Object.entries(defaultModels ?? {}).filter(([, id]) =>
    Boolean(id),
  ) as [LlmTask, string][];
  if (entries.length === 0) return;

  const models = await LlmModel.find({
    _id: { $in: entries.map(([, id]) => id) },
  });
  const byId = new Map(models.map((m) => [m._id.toString(), m]));

  for (const [task, modelId] of entries) {
    const model = byId.get(modelId);
    if (!model) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `default_models.${task}: no LLM model exists with id ${modelId}`,
      );
    }
    if (!model.is_active) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `default_models.${task}: model "${model.display_name}" is not active`,
      );
    }
    const required: LlmModelCapability =
      task === 'embedding' ? 'embedding' : 'chat';
    if (!model.capabilities.includes(required)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `default_models.${task}: model "${model.display_name}" has no "${required}" capability`,
      );
    }
  }
};

const updateTeam = async (
  teamId: string,
  payload: Partial<
    Pick<
      ITeam,
      | 'name'
      | 'description'
      | 'voice_profile'
      | 'subscribed_categories'
      | 'default_style_pack_id'
      | 'default_models'
    >
  >,
  requestingUser: IRequestUser,
) => {
  if (payload.default_models) {
    await assertDefaultModelsResolvable(payload.default_models);
  }

  const dedupedPayload = payload.subscribed_categories
    ? {
        ...payload,
        subscribed_categories: [...new Set(payload.subscribed_categories)],
      }
    : payload;
  const team = await Team.findByIdAndUpdate(teamId, dedupedPayload, {
    new: true,
    runValidators: true,
  });
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }

  // Explicit invalidation on the write path, not a shorter TTL: a settings change is exactly the
  // moment a stale read is most visible, because the user is looking at the screen they just saved.
  await Promise.all([
    invalidate('team:ready', teamId),
    invalidate('team', teamId),
    invalidate('team:voice', teamId),
  ]);

  void ActivityLogService.recordActivity({
    team_id: teamId,
    actor: requestingUser,
    action: 'team.settings_updated',
    summary: `Updated team settings (${Object.keys(payload).join(', ')})`,
    target_type: 'team',
    target_id: teamId,
  });

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

const addMember = async (
  teamId: string,
  userId: string,
  role: TeamMemberRole = 'member',
  requestingUser: IRequestUser,
) => {
  const [team, user] = await Promise.all([
    Team.findById(teamId),
    User.findById(userId),
  ]);
  if (!team) throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const existing = await TeamMembership.findOne({
    team_id: teamId,
    user_id: userId,
  });
  if (existing) {
    throw new AppError(
      httpStatus.CONFLICT,
      'User is already a member of this team',
    );
  }

  const membership = await TeamMembership.create({
    team_id: teamId,
    user_id: userId,
    role,
  });

  void ActivityLogService.recordActivity({
    team_id: teamId,
    actor: requestingUser,
    action: 'team.member_added',
    summary: `Added ${user.name} to the team as ${role === 'team_admin' ? 'team admin' : 'a member'}`,
    target_type: 'team',
    target_id: teamId,
  });

  return membership;
};

const removeMember = async (
  teamId: string,
  userId: string,
  requestingUser: IRequestUser,
) => {
  const membership = await TeamMembership.findOne({
    team_id: teamId,
    user_id: userId,
  });
  if (!membership) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User is not a member of this team',
    );
  }
  if (membership.role === 'team_admin') {
    await assertNotLastTeamAdmin(teamId, userId);
  }
  await membership.deleteOne();

  const user = await User.findById(userId).select('name');
  void ActivityLogService.recordActivity({
    team_id: teamId,
    actor: requestingUser,
    action: 'team.member_removed',
    summary: `Removed ${user?.name ?? 'a member'} from the team`,
    target_type: 'team',
    target_id: teamId,
  });

  return membership;
};

/** A team must always keep at least one team_admin — thrown before the caller's own
 *  role-change/removal would drop the count to zero. `excludingUserId` is the member being
 *  demoted/removed, so it doesn't count itself as "still a team_admin". */
const assertNotLastTeamAdmin = async (
  teamId: string,
  excludingUserId: string,
): Promise<void> => {
  const remaining = await TeamMembership.countDocuments({
    team_id: teamId,
    role: 'team_admin',
    user_id: { $ne: excludingUserId },
  });
  if (remaining === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'A team must always have at least one team admin',
    );
  }
};

const setMemberRole = async (
  teamId: string,
  userId: string,
  role: TeamMemberRole,
  requestingUser: IRequestUser,
) => {
  const membership = await TeamMembership.findOne({
    team_id: teamId,
    user_id: userId,
  });
  if (!membership) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User is not a member of this team',
    );
  }
  if (membership.role === 'team_admin' && role === 'member') {
    await assertNotLastTeamAdmin(teamId, userId);
  }
  membership.role = role;
  await membership.save();

  const user = await User.findById(userId).select('name');
  void ActivityLogService.recordActivity({
    team_id: teamId,
    actor: requestingUser,
    action: 'team.member_role_changed',
    summary: `Changed ${user?.name ?? 'a member'}'s role to ${role === 'team_admin' ? 'team admin' : 'member'}`,
    target_type: 'team',
    target_id: teamId,
  });

  return membership;
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

  const existing = [...taxonomyCategories, ...team.custom_categories].map((c) =>
    c.toLowerCase(),
  );
  if (existing.includes(category.toLowerCase())) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'That category already exists for this team',
    );
  }
  if (team.custom_categories.length >= MAX_CUSTOM_CATEGORIES) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `A team may have at most ${MAX_CUSTOM_CATEGORIES} custom categories`,
    );
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
  team.custom_categories = team.custom_categories.filter(
    (c) => c.toLowerCase() !== category.toLowerCase(),
  );
  if (team.custom_categories.length === before) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'That custom category does not exist for this team',
    );
  }

  await team.save();
  return team;
};

export const TeamService = {
  getTeamIdsForUser,
  getTeamAdminTeamIdsForUser,
  createTeam,
  listTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
  setMemberRole,
  getEffectiveCategories,
  addCustomCategory,
  removeCustomCategory,
  isTeamReady,
};
