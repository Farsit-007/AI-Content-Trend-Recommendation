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
exports.MetaOAuthController = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const metaOAuth_service_1 = require("./metaOAuth.service");
/**
 * teamId arrives via query/body here (not a route param), so `requireTeamAccess` can't gate it.
 * Mirror its rule: global admin/super_admin pass; everyone else must be a member of the team.
 */
const requireTeamId = (raw) => {
    if (typeof raw !== 'string' || raw.length === 0) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'teamId is required');
    }
    return raw;
};
const assertTeamAccess = (req, teamId) => {
    var _a, _b, _c;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'admin' || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === 'super_admin')
        return;
    if (!((_c = req.user) === null || _c === void 0 ? void 0 : _c.team_ids.includes(teamId))) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
};
const connect = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const teamId = requireTeamId(req.query.teamId);
    assertTeamAccess(req, teamId);
    const url = yield metaOAuth_service_1.MetaOAuthService.buildConnectUrl(teamId, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Facebook connect URL generated',
        data: { url },
    });
}));
const callback = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const redirectUrl = yield metaOAuth_service_1.MetaOAuthService.handleCallback({
        code: req.query.code,
        state: req.query.state,
        error: req.query.error,
    });
    res.redirect(httpStatus_1.httpStatus.FOUND, redirectUrl);
}));
const pages = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const teamId = requireTeamId(req.query.teamId);
    assertTeamAccess(req, teamId);
    const result = yield metaOAuth_service_1.MetaOAuthService.listPendingPages(teamId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Pending Facebook pages retrieved',
        data: result,
    });
}));
const selectPage = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { teamId, pageId } = req.body;
    assertTeamAccess(req, teamId);
    const result = yield metaOAuth_service_1.MetaOAuthService.selectPage(teamId, req.user.id, pageId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Facebook page connected',
        data: result,
    });
}));
const disconnect = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const teamId = requireTeamId(req.query.teamId);
    assertTeamAccess(req, teamId);
    yield metaOAuth_service_1.MetaOAuthService.disconnect(teamId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Facebook disconnected',
        data: { disconnected: true },
    });
}));
const dataDeletion = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const signedRequest = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.signed_request) !== null && _b !== void 0 ? _b : '';
    const result = yield metaOAuth_service_1.MetaOAuthService.handleDataDeletion(signedRequest);
    res.status(httpStatus_1.httpStatus.OK).json(result);
}));
exports.MetaOAuthController = {
    connect,
    callback,
    pages,
    selectPage,
    disconnect,
    dataDeletion,
};
