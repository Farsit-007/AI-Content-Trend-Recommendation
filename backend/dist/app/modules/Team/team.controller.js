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
exports.TeamController = void 0;
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const team_service_1 = require("./team.service");
const createTeam = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, description, member_ids } = req.body;
    const result = yield team_service_1.TeamService.createTeam({ name, description }, member_ids !== null && member_ids !== void 0 ? member_ids : [], req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'Team created successfully',
        data: result,
    });
}));
const listTeams = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.listTeams(req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Teams retrieved successfully',
        data: result,
    });
}));
const getTeamById = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.getTeamById(req.params.teamId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Team retrieved successfully',
        data: result,
    });
}));
const updateTeam = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.updateTeam(req.params.teamId, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Team updated successfully',
        data: result,
    });
}));
const deleteTeam = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.deleteTeam(req.params.teamId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Team deleted successfully',
        data: result,
    });
}));
const addMember = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.addMember(req.params.teamId, req.body.user_id);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'Member added to team successfully',
        data: result,
    });
}));
const removeMember = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.removeMember(req.params.teamId, req.params.userId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Member removed from team successfully',
        data: result,
    });
}));
const getCategories = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.getEffectiveCategories(req.params.teamId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Team categories retrieved successfully',
        data: result,
    });
}));
const addCategory = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.addCustomCategory(req.params.teamId, req.body.category);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'Category added successfully',
        data: result,
    });
}));
const removeCategory = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield team_service_1.TeamService.removeCustomCategory(req.params.teamId, req.params.category);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Category removed successfully',
        data: result,
    });
}));
exports.TeamController = {
    createTeam,
    listTeams,
    getTeamById,
    updateTeam,
    deleteTeam,
    addMember,
    removeMember,
    getCategories,
    addCategory,
    removeCategory,
};
