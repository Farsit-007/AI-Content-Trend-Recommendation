"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamService = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const httpStatus_1 = require("../../utils/httpStatus");
const user_model_1 = require("../User/user.model");
const newsIngestion_interface_1 = require("../NewsIngestion/newsIngestion.interface");
const team_model_1 = require("./team.model");
const MAX_CUSTOM_CATEGORIES = 20;
/** Every team id a user belongs to. Used by `requireAuth` to populate `req.user.team_ids`. */
const getTeamIdsForUser = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const memberships = yield team_model_1.TeamMembership.find({ user_id: userId }).select('team_id');
    return memberships.map((m) => m.team_id.toString());
});
const createTeam = (payload, memberUserIds, createdBy) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield team_model_1.Team.create(Object.assign(Object.assign({}, payload), { created_by: createdBy }));
    if (memberUserIds.length) {
        const users = yield user_model_1.User.find({ _id: { $in: memberUserIds } }).select('_id');
        if (users.length !== new Set(memberUserIds).size) {
            throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'One or more member user ids do not exist');
        }
        yield team_model_1.TeamMembership.insertMany(memberUserIds.map((user_id) => ({ team_id: team._id, user_id })));
    }
    return team;
});
const listTeams = (requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    if (requestingUser.role === 'admin') {
        return team_model_1.Team.find();
    }
    return team_model_1.Team.find({ _id: { $in: requestingUser.team_ids } });
});
const getTeamById = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield team_model_1.Team.findById(teamId);
    if (!team) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Team not found');
    }
    const memberships = yield team_model_1.TeamMembership.find({ team_id: teamId }).populate('user_id', 'name email role');
    return { team, members: memberships.map((m) => m.user_id) };
});
const updateTeam = (teamId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield team_model_1.Team.findByIdAndUpdate(teamId, payload, { new: true, runValidators: true });
    if (!team) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Team not found');
    }
    return team;
});
const deleteTeam = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield team_model_1.Team.findByIdAndDelete(teamId);
    if (!team) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Team not found');
    }
    yield team_model_1.TeamMembership.deleteMany({ team_id: teamId });
    return team;
});
const addMember = (teamId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const [team, user] = yield Promise.all([team_model_1.Team.findById(teamId), user_model_1.User.findById(userId)]);
    if (!team)
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Team not found');
    if (!user)
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'User not found');
    const existing = yield team_model_1.TeamMembership.findOne({ team_id: teamId, user_id: userId });
    if (existing) {
        throw new AppError_1.default(httpStatus_1.httpStatus.CONFLICT, 'User is already a member of this team');
    }
    return team_model_1.TeamMembership.create({ team_id: teamId, user_id: userId });
});
const removeMember = (teamId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_model_1.TeamMembership.findOneAndDelete({ team_id: teamId, user_id: userId });
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'User is not a member of this team');
    }
    return result;
});
const getEffectiveCategories = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield team_model_1.Team.findById(teamId);
    if (!team) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Team not found');
    }
    return [...newsIngestion_interface_1.NEWS_CATEGORIES, ...team.custom_categories];
});
const addCustomCategory = (teamId, category) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield team_model_1.Team.findById(teamId);
    if (!team) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Team not found');
    }
    const existing = [...newsIngestion_interface_1.NEWS_CATEGORIES, ...team.custom_categories].map((c) => c.toLowerCase());
    if (existing.includes(category.toLowerCase())) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'That category already exists for this team');
    }
    if (team.custom_categories.length >= MAX_CUSTOM_CATEGORIES) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, `A team may have at most ${MAX_CUSTOM_CATEGORIES} custom categories`);
    }
    team.custom_categories.push(category);
    yield team.save();
    return team;
});
const removeCustomCategory = (teamId, category) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield team_model_1.Team.findById(teamId);
    if (!team) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Team not found');
    }
    const before = team.custom_categories.length;
    team.custom_categories = team.custom_categories.filter((c) => c.toLowerCase() !== category.toLowerCase());
    if (team.custom_categories.length === before) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'That custom category does not exist for this team');
    }
    yield team.save();
    return team;
});
exports.TeamService = {
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
